import crypto from 'crypto';
import GmailAppSentMessage from '../models/GmailAppSentMessage.js';
import CommunicationEmailLog from '../models/CommunicationEmailLog.js';
import gmailOAuthService, { GMAIL_MODIFY_SCOPE } from './gmailOAuthService.js';

const PREVIEW_TTL_MS = 5 * 60 * 1000;
const PERIODS = new Set(['today', 'this_week', 'this_month', 'all_time']);
const SOURCES = new Set(['all_sent', 'app_sent']);
const SENT_LABEL = 'SENT';

const createError = (message, statusCode = 400, code) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (code) error.code = code;
    return error;
};

const getDateParts = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day)
    };
};

const toUtcDate = ({ year, month, day }) => new Date(Date.UTC(year, month - 1, day));

const addCalendarDays = (date, days) => {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
};

const zonedMidnightToUtc = (date, timeZone) => {
    const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    let result = target;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(new Date(result));
        const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
        const represented = Date.UTC(
            values.year,
            values.month - 1,
            values.day,
            values.hour,
            values.minute,
            values.second
        );
        const next = result + target - represented;
        if (next === result) break;
        result = next;
    }
    return new Date(result);
};

export const resolveCleanupDateRange = (period, timeZone, now = new Date()) => {
    if (!PERIODS.has(period)) throw createError('Choose a valid cleanup period.');
    if (typeof timeZone !== 'string' || !timeZone.trim() || timeZone.length > 100) {
        throw createError('Use a valid browser/device timezone.');
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone }).format(now);
    } catch {
        throw createError('Use a valid browser/device timezone.');
    }
    const cutoff = new Date(Math.floor(now.getTime() / 1000) * 1000);
    if (period === 'all_time') return { startAt: null, endAt: cutoff, cutoff };

    const today = toUtcDate(getDateParts(now, timeZone));
    let startDate = today;
    let endDate;
    if (period === 'today') {
        endDate = addCalendarDays(today, 1);
    } else if (period === 'this_week') {
        const daysSinceMonday = (today.getUTCDay() + 6) % 7;
        startDate = addCalendarDays(today, -daysSinceMonday);
        endDate = addCalendarDays(startDate, 7);
    } else {
        startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    }

    return {
        startAt: zonedMidnightToUtc(startDate, timeZone),
        endAt: zonedMidnightToUtc(endDate, timeZone),
        cutoff
    };
};

const getSigningSecret = () => {
    const secret = process.env.GMAIL_CLEANUP_TOKEN_SECRET || process.env.JWT_SECRET;
    if (!secret) throw createError('Gmail cleanup is not configured.', 500);
    return secret;
};

const sign = (encodedPayload) =>
    crypto.createHmac('sha256', getSigningSecret()).update(encodedPayload).digest('base64url');

const createPreviewToken = (payload) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${sign(encoded)}`;
};

const parsePreviewToken = (token, userId) => {
    if (typeof token !== 'string') throw createError('Preview the messages again before deleting.');
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) throw createError('Preview the messages again before deleting.');

    const expected = Buffer.from(sign(encoded));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        throw createError('This preview is invalid. Preview the messages again.');
    }

    let payload;
    try {
        payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
        throw createError('This preview is invalid. Preview the messages again.');
    }
    if (payload.userId !== String(userId) || payload.expiresAt < Date.now()) {
        throw createError('This preview expired. Preview the messages again.');
    }
    if (!SOURCES.has(payload.source) || !PERIODS.has(payload.period)) {
        throw createError('This preview is invalid. Preview the messages again.');
    }
    return payload;
};

const toGmailQuery = ({ startAt, endAt, cutoff }) => {
    const upperBound = endAt && endAt < cutoff ? endAt : cutoff;
    const terms = [`label:${SENT_LABEL}`, `before:${Math.floor(upperBound.getTime() / 1000)}`];
    if (startAt) {
        terms.push(`after:${Math.floor(startAt.getTime() / 1000) - 1}`);
    }
    return terms.join(' ');
};

const listSentMessageIds = async (gmail, range) => {
    const ids = [];
    let pageToken;
    do {
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: toGmailQuery(range),
            maxResults: 500,
            ...(pageToken ? { pageToken } : {})
        });
        ids.push(...(response.data.messages || []).map((message) => message.id));
        pageToken = response.data.nextPageToken;
    } while (pageToken);
    return ids;
};

const getAppSentCandidates = async (userId, accountEmail) => {
    const [indexedMessages, communicationLogs] = await Promise.all([
        GmailAppSentMessage.find({ user: userId, accountEmail }).select('messageId').lean(),
        CommunicationEmailLog.find({
            sender: userId,
            senderEmail: accountEmail,
            provider: 'gmail_oauth',
            status: { $in: ['sent', 'partial'] }
        }).select('sendResults').lean()
    ]);
    const messageIds = new Set(indexedMessages.map(({ messageId }) => messageId));
    for (const log of communicationLogs) {
        for (const result of log.sendResults || []) {
            if (result?.success && result.providerMessageId) {
                messageIds.add(String(result.providerMessageId));
            }
        }
    }
    return [...messageIds];
};

const getMetadata = async (gmail, id) => {
    const response = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['Subject']
    });
    return response.data;
};

const getPreviewItems = async (gmail, ids) => {
    const sample = [];
    for (const id of ids.slice(0, 5)) {
        const message = await getMetadata(gmail, id);
        const subject = (message.payload?.headers || [])
            .find((header) => header.name?.toLowerCase() === 'subject')?.value || '(No subject)';
        sample.push({
            subject,
            date: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null
        });
    }
    return sample;
};

const resolveMessageIds = async (gmail, userId, accountEmail, selection) => {
    const range = {
        startAt: selection.startAt ? new Date(selection.startAt) : null,
        endAt: selection.endAt ? new Date(selection.endAt) : null,
        cutoff: new Date(selection.cutoff)
    };
    if (selection.source === 'all_sent') return listSentMessageIds(gmail, range);

    const candidates = await getAppSentCandidates(userId, accountEmail);
    const indexedIds = new Set(candidates);
    const currentlySentIds = await listSentMessageIds(gmail, range);
    return currentlySentIds.filter((id) => indexedIds.has(id));
};

export const moveMessagesToTrash = async (gmail, ids, logger) => {
    let trashedCount = 0;
    let failedCount = 0;
    for (let index = 0; index < ids.length; index += 5) {
        const batch = ids.slice(index, index + 5);
        const results = await Promise.allSettled(
            batch.map((id) => gmail.users.messages.trash({ userId: 'me', id }))
        );
        results.forEach((result) => {
            if (result.status === 'fulfilled') trashedCount += 1;
            else failedCount += 1;
        });
        if (results.some((result) => result.status === 'rejected')) {
            logger.warn('Some Gmail messages could not be moved to Trash', {
                batchSize: batch.length,
                failedCount: results.filter((result) => result.status === 'rejected').length
            });
        }
    }
    return { trashedCount, failedCount };
};

class GmailSentCleanupService {
    async getStatus(userId) {
        const status = await gmailOAuthService.getTokenStatus(userId);
        return {
            ...status,
            canManageMailbox: Boolean(status.connected && status.grantedScopes?.includes(GMAIL_MODIFY_SCOPE))
        };
    }

    async preview(userId, { source, period, timeZone }) {
        if (!SOURCES.has(source)) throw createError('Choose a valid sent-mail source.');
        const status = await this.getStatus(userId);
        if (!status.connected) throw createError('Connect a Gmail account before previewing messages.', 409, 'GMAIL_NOT_CONNECTED');
        if (!status.canManageMailbox) {
            throw createError('Reconnect Gmail and allow mailbox management before previewing messages.', 403, 'GMAIL_MODIFY_SCOPE_REQUIRED');
        }

        const range = resolveCleanupDateRange(period, timeZone);
        const { gmail } = await gmailOAuthService.getAuthorizedGmailClient(userId, { requireModify: true });
        const effectiveEndAt = range.endAt && range.endAt < range.cutoff ? range.endAt : range.cutoff;
        const selection = {
            source,
            period,
            timeZone,
            startAt: range.startAt?.toISOString() || null,
            endAt: effectiveEndAt.toISOString(),
            cutoff: range.cutoff.toISOString()
        };
        const messageIds = await resolveMessageIds(gmail, userId, status.email, selection);
        selection.previewCount = messageIds.length;
        selection.selectionHash = crypto
            .createHash('sha256')
            .update([...messageIds].sort().join('\n'))
            .digest('hex');
        return {
            previewToken: createPreviewToken({
                ...selection,
                userId: String(userId),
                accountEmail: status.email,
                expiresAt: Date.now() + PREVIEW_TTL_MS
            }),
            accountEmail: status.email,
            source,
            period,
            timeZone,
            startAt: selection.startAt,
            endAt: selection.endAt,
            previewedAt: selection.cutoff,
            count: messageIds.length,
            sample: await getPreviewItems(gmail, messageIds)
        };
    }

    async moveToTrash(userId, previewToken, auditModel, logger) {
        const selection = parsePreviewToken(previewToken, userId);
        const status = await this.getStatus(userId);
        if (!status.connected || status.email !== selection.accountEmail) {
            throw createError('The connected Gmail account changed. Preview the messages again.', 409);
        }
        if (!status.canManageMailbox) {
            throw createError('Reconnect Gmail and allow mailbox management before deleting messages.', 403, 'GMAIL_MODIFY_SCOPE_REQUIRED');
        }

        const { gmail } = await gmailOAuthService.getAuthorizedGmailClient(userId, { requireModify: true });
        const messageIds = await resolveMessageIds(gmail, userId, status.email, selection);
        const selectionHash = crypto
            .createHash('sha256')
            .update([...messageIds].sort().join('\n'))
            .digest('hex');
        if (
            messageIds.length !== selection.previewCount ||
            selectionHash !== selection.selectionHash
        ) {
            throw createError('The matching messages changed after preview. Preview again before deleting.', 409);
        }
        const audit = await auditModel.create({
            user: userId,
            accountEmail: status.email,
            source: selection.source,
            period: selection.period,
            timeZone: selection.timeZone,
            previewCount: messageIds.length,
            status: 'started'
        });

        const result = await moveMessagesToTrash(gmail, messageIds, logger);
        const finalStatus = result.failedCount === 0
            ? 'completed'
            : result.trashedCount > 0 ? 'partial' : 'failed';
        let auditRecorded = true;
        try {
            await auditModel.updateOne(
                { _id: audit._id },
                {
                    $set: {
                        trashedCount: result.trashedCount,
                        failedCount: result.failedCount,
                        status: finalStatus
                    }
                }
            );
        } catch (error) {
            auditRecorded = false;
            logger.error('Failed to finalize Gmail cleanup audit record', {
                auditId: String(audit._id),
                userId: String(userId),
                error: error.message
            });
        }

        if (result.failedCount > 0) {
            logger.warn('Gmail cleanup completed with messages that could not be moved to Trash', {
                userId: String(userId),
                source: selection.source,
                period: selection.period,
                trashedCount: result.trashedCount,
                failedCount: result.failedCount
            });
        }
        return { ...result, auditRecorded, accountEmail: status.email };
    }
}

export default new GmailSentCleanupService();
