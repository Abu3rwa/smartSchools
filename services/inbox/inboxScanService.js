/**
 * One scan of the teacher's newest inbox messages: list, classify and store.
 * The mailbox is only ever read here.
 */
import InboxAssistantSettings from '../../models/InboxAssistantSettings.js';
import InboxEmail from '../../models/InboxEmail.js';
import InboxDeadline from '../../models/InboxDeadline.js';
import InboxScanRun from '../../models/InboxScanRun.js';
import { getPlatformInboxSettings } from '../inboxSettingsService.js';
import {
    assertHasCredit,
    getCreditBadge,
    getMarkupPercent,
    isCreditError
} from '../aiCreditService.js';
import logger from '../../utils/logger.js';
import inboxGmailReader from './inboxGmailReader.js';
import inboxAiService from './inboxAiService.js';
import { classifyByRule } from './inboxPrefilter.js';
import { hashBody } from './inboxHash.js';
import { estimateScanCents } from './inboxCostEstimator.js';
import { trimBody } from './inboxBodyText.js';
import { lookupSenderRoles } from './inboxSenderRoles.js';

const SCAN_MODES = new Set(['refresh', 'full']);
const RUN_LOCK_MS = 10 * 60 * 1000;
const REPLY_CHECK_LIMIT = 30;
const REPLY_CHECK_PARALLEL = 5;
const SENT_LABEL = 'SENT';

const createError = (message, statusCode = 400, code, data) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (code) error.code = code;
    if (data !== undefined) error.data = data;
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

const zonedDateTimeToUtc = ({ year, month, day, hour = 0, minute = 0 }, timeZone) => {
    const target = Date.UTC(year, month - 1, day, hour, minute, 0);
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
        if (result + target - represented === result) break;
        result += target - represented;
    }
    return new Date(result);
};

const safeTimeZone = (timeZone) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
        return timeZone;
    } catch {
        return 'UTC';
    }
};

const startOfToday = (timeZone) => {
    const parts = getDateParts(new Date(), timeZone);
    return zonedDateTimeToUtc(parts, timeZone);
};

const modeOf = (mode) => {
    if (!SCAN_MODES.has(mode)) {
        throw createError('Choose a scan mode.', 400, 'INVALID_SCAN_MODE');
    }
    return mode;
};

const loadContext = async (user) => {
    const settings = await InboxAssistantSettings.findOne({
        school: user.school,
        user: user._id
    }).lean();
    if (!settings?.optedIn) {
        throw createError('Turn on Inbox Assistant before scanning.', 403, 'INBOX_NOT_OPTED_IN');
    }
    const platform = await getPlatformInboxSettings();
    if (platform.enabled === false) {
        throw createError(
            'Inbox Assistant is turned off by the platform.',
            403,
            'INBOX_DISABLED'
        );
    }
    const scanSize = Math.max(
        10,
        Math.min(Number(settings.scanSize) || 25, Number(platform.maxScanSize) || 50)
    );
    return { settings, platform, scanSize };
};

const storedForIds = (user, ids) => InboxEmail.find({
    school: user.school,
    user: user._id,
    gmailMessageId: { $in: ids }
}).select('gmailMessageId bodyHash').lean();

const planScan = async (user, { scanSize, mode, reanalyze }) => {
    const listed = await inboxGmailReader.listInboxIds(user._id, { limit: scanSize });
    const ids = listed.map((message) => message.id);
    const stored = ids.length ? await storedForIds(user, ids) : [];
    const storedById = new Map(stored.map((row) => [row.gmailMessageId, row]));
    const refetchAll = mode === 'full' && Boolean(reanalyze);
    const candidates = refetchAll ? ids : ids.filter((id) => !storedById.has(id));

    return {
        ids,
        candidates,
        storedById,
        listedCount: ids.length,
        newCount: candidates.length,
        skippedCount: ids.length - candidates.length,
        refetchAll
    };
};

const scanEstimate = async (user, plan, markupPercent) => {
    const estimateCents = estimateScanCents({
        emailCount: plan.candidates.length,
        markupPercent
    });
    const badge = await getCreditBadge({ schoolId: user.school, userId: user._id });
    return { estimateCents, creditBalanceCents: badge.balanceCents };
};

const estimateScan = async (user, { mode } = {}) => {
    const plannedMode = modeOf(mode || 'refresh');
    const { scanSize } = await loadContext(user);
    const plan = await planScan(user, { scanSize, mode: plannedMode, reanalyze: false });
    const { estimateCents, creditBalanceCents } = await scanEstimate(
        user,
        plan,
        await getMarkupPercent()
    );
    return {
        listedCount: plan.listedCount,
        newCount: plan.newCount,
        skippedCount: plan.skippedCount,
        estimateCents,
        creditBalanceCents
    };
};

const closeRun = async (run, patch = {}, status = 'completed') => {
    const finishedAt = new Date();
    await InboxScanRun.updateOne(
        { _id: run._id, school: run.school, user: run.user },
        { $set: { ...patch, status, finishedAt } }
    );
    return { ...patch, status, finishedAt };
};

const openRun = async (user, mode) => {
    await InboxScanRun.updateMany(
        {
            school: user.school,
            user: user._id,
            status: 'running',
            startedAt: { $lt: new Date(Date.now() - RUN_LOCK_MS) }
        },
        { $set: { status: 'failed', finishedAt: new Date(), errorCode: 'SCAN_TIMEOUT' } }
    );
    try {
        return await InboxScanRun.create({
            school: user.school,
            user: user._id,
            mode,
            status: 'running',
            startedAt: new Date()
        });
    } catch (error) {
        if (error?.code === 11000) {
            throw createError(
                'A scan is already running. Wait for it to finish.',
                409,
                'SCAN_ALREADY_RUNNING'
            );
        }
        throw error;
    }
};

const freeAllowanceApplies = async (user, platform, timeZone) => {
    const allowance = Number(platform.freeScansPerDay) || 0;
    if (allowance <= 0) return false;
    const freeUsed = await InboxScanRun.countDocuments({
        school: user.school,
        user: user._id,
        startedAt: { $gte: startOfToday(timeZone) },
        status: 'completed',
        charged: false
    });
    return freeUsed < allowance;
};

const deadlineDueAt = (deadline, timeZone) => {
    const [year, month, day] = deadline.dueDate.split('-').map(Number);
    const [hour, minute] = (deadline.dueTime || '00:00').split(':').map(Number);
    return zonedDateTimeToUtc({ year, month, day, hour, minute }, timeZone);
};

const saveEmail = async (user, message, classification, extra, scanRun) => {
    const fields = {
        school: user.school,
        user: user._id,
        gmailMessageId: message.id,
        threadId: message.threadId,
        receivedAt: message.receivedAt,
        fromName: message.fromName,
        fromEmail: message.fromEmail,
        replyToEmail: message.replyToEmail,
        ccEmails: message.ccEmails,
        toEmails: message.toEmails,
        subject: message.subject,
        messageIdHeader: message.messageIdHeader,
        referencesHeader: message.referencesHeader,
        bodyText: extra.bodyText,
        bodyPurgedAt: null,
        bodyHash: extra.bodyHash,
        senderRole: extra.senderRole,
        language: classification.language,
        priority: classification.priority,
        summary: classification.summary,
        reason: classification.reason,
        suggestedReplyType: classification.suggestedReplyType,
        classifiedBy: extra.classifiedBy,
        scanRun: scanRun._id
    };

    return InboxEmail.findOneAndUpdate(
        { school: user.school, user: user._id, gmailMessageId: message.id },
        { $set: { ...fields, school: user.school } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

const saveDeadlines = async (user, email, deadlines, timeZone) => {
    for (const deadline of deadlines) {
        const exists = await InboxDeadline.findOne({
            school: user.school,
            user: user._id,
            email: email._id,
            quote: deadline.quote
        }).select('_id').lean();
        if (exists) continue;

        await InboxDeadline.create({
            school: user.school,
            user: user._id,
            email: email._id,
            title: deadline.title,
            dueAt: deadlineDueAt(deadline, timeZone),
            dueDateOnly: !deadline.dueTime,
            timeZone,
            quote: deadline.quote,
            state: 'proposed',
            source: 'ai'
        });
    }
};

const detectReplies = async (user) => {
    const pending = await InboxEmail.find({
        school: user.school,
        user: user._id,
        priority: 'needs_reply',
        status: 'open'
    })
        .sort({ receivedAt: -1 })
        .limit(REPLY_CHECK_LIMIT)
        .select('threadId receivedAt')
        .lean();

    for (let index = 0; index < pending.length; index += REPLY_CHECK_PARALLEL) {
        const batch = pending.slice(index, index + REPLY_CHECK_PARALLEL);
        await Promise.all(batch.map(async (email) => {
            try {
                const messages = await inboxGmailReader.getThread(user._id, email.threadId);
                const replied = messages.some(
                    (message) =>
                        message.labelIds.includes(SENT_LABEL) &&
                        message.internalDate > new Date(email.receivedAt).getTime()
                );
                if (!replied) return;
                await InboxEmail.updateOne(
                    {
                        school: user.school,
                        user: user._id,
                        threadId: email.threadId,
                        priority: 'needs_reply',
                        status: 'open'
                    },
                    { $set: { status: 'replied', repliedDetectedAt: new Date() } }
                );
            } catch (error) {
                logger.warn('inbox_reply_detection_failed', {
                    threadId: email.threadId,
                    error: error?.message
                });
            }
        }));
    }
};

const runScan = async (user, {
    mode,
    acceptedEstimateCents,
    timeZone,
    uiLanguage = 'en',
    reanalyze = false
} = {}) => {
    const plannedMode = modeOf(mode || 'refresh');
    if (!Number.isFinite(Number(acceptedEstimateCents)) || Number(acceptedEstimateCents) < 0) {
        throw createError('Get a fresh estimate before scanning.', 400, 'ESTIMATE_REQUIRED');
    }
    const tz = safeTimeZone(timeZone);
    const { platform, scanSize } = await loadContext(user);

    const todayCount = await InboxScanRun.countDocuments({
        school: user.school,
        user: user._id,
        startedAt: { $gte: startOfToday(tz) }
    });
    if (todayCount >= Number(platform.maxScansPerDay)) {
        throw createError(
            `You have used today's ${platform.maxScansPerDay} scans. Try again tomorrow.`,
            429,
            'SCAN_DAILY_LIMIT'
        );
    }

    const run = await openRun(user, plannedMode);
    let counts = {
        listedCount: 0,
        newCount: 0,
        skippedCount: 0,
        ruleClassifiedCount: 0,
        aiClassifiedCount: 0,
        aiFailedCount: 0,
        estimateCents: 0,
        charged: false
    };

    try {
        const plan = await planScan(user, { scanSize, mode: plannedMode, reanalyze });
        const markupPercent = await getMarkupPercent();
        const { estimateCents } = await scanEstimate(user, plan, markupPercent);
        counts = {
            ...counts,
            listedCount: plan.listedCount,
            newCount: plan.newCount,
            skippedCount: plan.skippedCount,
            estimateCents
        };

        const accepted = Number(acceptedEstimateCents);
        if (estimateCents > accepted * 1.2 + 0.05) {
            await closeRun(run, { ...counts, errorCode: 'ESTIMATE_CHANGED' }, 'failed');
            throw createError(
                'The estimate changed. Review the new estimate and try again.',
                409,
                'ESTIMATE_CHANGED',
                { estimateCents, newCount: plan.newCount, skippedCount: plan.skippedCount }
            );
        }

        const freeRun = await freeAllowanceApplies(user, platform, tz);
        counts.charged = !freeRun;

        if (plan.candidates.length) {
            try {
                await assertHasCredit({ schoolId: user.school, userId: user._id });
            } catch (error) {
                if (isCreditError(error)) {
                    await closeRun(run, { ...counts, errorCode: error.code }, 'failed');
                }
                throw error;
            }
        }

        const messages = plan.candidates.length
            ? await inboxGmailReader.fetchMessages(user._id, plan.candidates)
            : [];

        const frozen = plan.refetchAll
            ? messages.filter((message) => {
                const stored = plan.storedById.get(message.id);
                return !stored || stored.bodyHash !== hashBody(message.subject, trimBody(message.bodyText));
            })
            : messages;

        counts.skippedCount += messages.length - frozen.length;

        const roles = await lookupSenderRoles(
            user.school,
            frozen.map((message) => message.fromEmail)
        );
        const prepared = frozen.map((message) => {
            const bodyText = trimBody(message.bodyText);
            const senderRole = roles[message.fromEmail] || '';
            return {
                message,
                bodyText,
                bodyHash: hashBody(message.subject, bodyText),
                senderRole,
                rule: senderRole ? null : classifyByRule(message.headers, message.fromEmail)
            };
        });

        const ruleReady = prepared.filter((entry) => entry.rule);
        const aiReady = prepared.filter((entry) => !entry.rule);
        const classifications = new Map();

        for (const entry of ruleReady) {
            classifications.set(entry.message.id, {
                priority: 'ignore',
                summary: '',
                reason: entry.rule.reason || '',
                language: 'other',
                suggestedReplyType: null,
                deadlines: []
            });
        }

        if (aiReady.length) {
            const result = await inboxAiService.classifyBatch({
                emails: aiReady.map((entry) => ({
                    ...entry.message,
                    bodyText: entry.bodyText,
                    senderRole: entry.senderRole
                })),
                uiLanguage,
                timeZone: tz,
                billing: {
                    schoolId: user.school,
                    userId: user._id,
                    scanRun: run._id
                },
                billable: !freeRun
            });
            for (const classification of result.classifications) {
                classifications.set(classification.gmailMessageId, classification);
            }
            counts.aiFailedCount = result.aiFailedCount || 0;
        }

        for (const entry of prepared) {
            const classification = classifications.get(entry.message.id);
            if (!classification) continue;
            const email = await saveEmail(user, entry.message, classification, {
                bodyText: entry.bodyText,
                bodyHash: entry.bodyHash,
                senderRole: entry.senderRole,
                classifiedBy: entry.rule ? 'rule' : 'ai'
            }, run);
            if (entry.rule) counts.ruleClassifiedCount += 1;
            else counts.aiClassifiedCount += 1;
            await saveDeadlines(user, email, classification.deadlines, tz);
        }

        await detectReplies(user);
        const finished = await closeRun(run, counts, 'completed');

        await InboxAssistantSettings.updateOne(
            { school: user.school, user: user._id },
            { $set: { lastScanAt: finished.finishedAt } }
        );

        return {
            id: run._id,
            mode: plannedMode,
            ...counts,
            startedAt: run.startedAt,
            finishedAt: finished.finishedAt
        };
    } catch (error) {
        const alreadyClosed = error?.code === 'ESTIMATE_CHANGED';
        if (!alreadyClosed) {
            await closeRun(run, { ...counts, errorCode: error?.code || 'SCAN_FAILED' }, 'failed');
        }
        throw error;
    }
};

export default { estimateScan, runScan };
export { estimateScan, runScan };
