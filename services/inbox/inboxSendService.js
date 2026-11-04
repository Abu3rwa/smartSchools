/** Sends a confirmed reply in the same Gmail thread and keeps the app-only sent list. */
import InboxEmail from '../../models/InboxEmail.js';
import InboxReplyDraft from '../../models/InboxReplyDraft.js';
import gmailOAuthService from '../gmailOAuthService.js';
import logger from '../../utils/logger.js';
import { resolveRecipients } from './inboxRecipients.js';
import { findPlaceholders } from './inboxDraftAiService.js';

const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

const createError = (message, statusCode = 400, code, data) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (code) error.code = code;
    if (data !== undefined) error.data = data;
    return error;
};

const notFound = (message) => createError(message, 404);
const badRequest = (message) => createError(message, 400);
const conflict = (message) => createError(message, 409);

export const buildReplyHtml = (body, language = 'en') => {
    const escaped = String(body ?? '').replace(/[&<>"']/g, (match) => HTML_ESCAPES[match]);
    const paragraphs = escaped
        .replace(/\r\n?/g, '\n')
        .trim()
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
        .join('');
    const dir = language === 'ar' ? ' dir="rtl"' : '';
    return `<div${dir}>${paragraphs}</div>`;
};

export const buildSendMailOptions = (draft, email, recipients) => {
    const references = [email.referencesHeader, email.messageIdHeader].filter(Boolean).join(' ');
    return {
        to: recipients.to.join(', '),
        cc: recipients.cc.join(', '),
        subject: draft.subject,
        text: draft.body,
        html: buildReplyHtml(draft.body, draft.language),
        ...(email.messageIdHeader ? { inReplyTo: email.messageIdHeader } : {}),
        ...(references ? { references } : {}),
        ...(email.threadId ? { threadId: email.threadId } : {})
    };
};

const shapeSent = (draft) => ({
    id: String(draft._id),
    emailId: String(draft.email),
    to: draft.to || [],
    cc: draft.cc || [],
    subject: draft.subject || '',
    body: draft.body || '',
    sentAt: draft.sentAt || null,
    threadId: draft.threadId || null
});

const loadDraft = async (user, draftId) => {
    const draft = await InboxReplyDraft.findOne({
        _id: draftId,
        school: user.school,
        user: user._id
    }).lean();
    if (!draft) throw notFound('Reply draft not found.');
    return draft;
};

const loadEmail = async (user, emailId) => {
    const email = await InboxEmail.findOne({
        _id: emailId,
        school: user.school,
        user: user._id
    }).lean();
    if (!email) throw notFound('Email not found.');
    return email;
};

export const sendDraft = async (user, draftId, { confirm, includeCc } = {}) => {
    if (confirm !== true) {
        throw badRequest('Confirm that you want to send this reply.');
    }
    if (includeCc !== undefined && typeof includeCc !== 'boolean') {
        throw badRequest('Choose whether to include Cc.');
    }

    const draft = await loadDraft(user, draftId);
    if (draft.status !== 'draft') {
        throw conflict('This reply was already sent or is being sent.');
    }

    const placeholders = findPlaceholders(draft.body);
    if (placeholders.length) {
        throw createError('Fill in the highlighted parts first.', 422, 'DRAFT_PLACEHOLDERS', {
            placeholders
        });
    }
    if (!String(draft.body || '').trim() || !String(draft.subject || '').trim()) {
        throw badRequest('The reply needs a subject and a body.');
    }

    const email = await loadEmail(user, draft.email);

    let recipients = { to: draft.to || [], cc: draft.cc || [] };
    if (includeCc !== undefined) {
        const token = await gmailOAuthService.getTokenStatus(user._id);
        recipients = resolveRecipients(email, { includeCc, selfAddress: token?.email || '' });
    }

    const claimed = await InboxReplyDraft.findOneAndUpdate(
        { _id: draft._id, school: user.school, user: user._id, status: 'draft' },
        { $set: { status: 'sending', sendIdempotencyKey: `${draft._id}:${Date.now()}` } },
        { new: true }
    ).lean();
    if (!claimed) {
        throw conflict('This reply was already sent or is being sent.');
    }

    const mailOptions = buildSendMailOptions(draft, email, recipients);
    let result;
    try {
        result = await gmailOAuthService.sendEmail(user._id, mailOptions);
    } catch (error) {
        await InboxReplyDraft.updateOne(
            { _id: draft._id, school: user.school, user: user._id, status: 'sending' },
            { $set: { status: 'draft', sendIdempotencyKey: null } }
        );
        if (error?.code === 'GMAIL_REAUTH_REQUIRED') throw error;
        throw Object.assign(new Error('Could not send the reply. Try again.'), {
            statusCode: 502,
            expose: true
        });
    }

    const sentAt = new Date();
    const threadId = result?.threadId || email.threadId || null;
    const saved = await InboxReplyDraft.findOneAndUpdate(
        { _id: draft._id, school: user.school, user: user._id, status: 'sending' },
        {
            $set: {
                status: 'sent',
                sentMessageId: result?.messageId || null,
                threadId,
                sentAt,
                to: recipients.to,
                cc: recipients.cc
            }
        },
        { new: true }
    ).lean();

    await InboxEmail.updateOne(
        { _id: email._id, school: user.school, user: user._id },
        { $set: { status: 'replied', repliedDetectedAt: sentAt } }
    );

    if (draft.gmailDraftId) {
        try {
            await gmailOAuthService.deleteGmailDraft(user._id, draft.gmailDraftId);
        } catch (error) {
            logger.warn('inbox_reply_gmail_draft_delete_failed', {
                userId: String(user._id),
                draftId: String(draft._id),
                error: error?.message
            });
        }
    }

    return shapeSent(saved || { ...draft, ...claimed, status: 'sent', sentAt, threadId });
};

export const listSent = async (user, { limit, cursor } = {}) => {
    const pageSize = Math.min(Math.max(Math.floor(Number(limit) || 25), 1), 100);
    const parsedCursor = Math.floor(Number(cursor) || 0);
    const offset = Number.isFinite(parsedCursor) && parsedCursor > 0 ? parsedCursor : 0;

    const rows = await InboxReplyDraft.find({
        school: user.school,
        user: user._id,
        status: 'sent'
    })
        .sort({ sentAt: -1 })
        .skip(offset)
        .limit(pageSize)
        .lean();

    return {
        sent: rows.map(shapeSent),
        nextCursor: rows.length === pageSize ? String(offset + pageSize) : null
    };
};

export const deleteSent = async (user, sentId) => {
    const removed = await InboxReplyDraft.findOneAndDelete({
        _id: sentId,
        school: user.school,
        user: user._id,
        status: 'sent'
    }).lean();
    if (!removed) throw notFound('Sent reply not found.');
    return { removed: 1 };
};

/** Deletes only the app's copy. Gmail and the mailbox are never touched. */
export const clearSent = async (user, { confirm } = {}) => {
    if (confirm !== true) {
        throw badRequest('Confirm that you want to empty the sent history.');
    }
    const result = await InboxReplyDraft.deleteMany({
        school: user.school,
        user: user._id,
        status: 'sent'
    });
    return { removed: Number(result?.deletedCount) || 0 };
};

export default {
    buildReplyHtml,
    buildSendMailOptions,
    sendDraft,
    listSent,
    deleteSent,
    clearSent,
    shapeSent
};
