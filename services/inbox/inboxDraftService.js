/** Reply drafts: write with the AI, edit, keep one active draft per email, discard. */
import InboxAssistantSettings from '../../models/InboxAssistantSettings.js';
import InboxEmail from '../../models/InboxEmail.js';
import InboxReplyDraft from '../../models/InboxReplyDraft.js';
import AiCreditEntry from '../../models/AiCreditEntry.js';
import gmailOAuthService from '../gmailOAuthService.js';
import { getPlatformInboxSettings } from '../inboxSettingsService.js';
import {
    assertHasCredit,
    getCreditBadge,
    getMarkupPercent,
    markUsageOutcome
} from '../aiCreditService.js';
import { findInboxReplyType } from '../../constants/inboxReplyTypes.js';
import { estimateDraftCents } from './inboxCostEstimator.js';
import inboxDraftAiService from './inboxDraftAiService.js';
import { resolveRecipients } from './inboxRecipients.js';
import { buildReplyHtml } from './inboxSendService.js';
import logger from '../../utils/logger.js';

const TONES = new Set(['professional', 'short', 'warm', 'formal']);
const MAX_NOTE = 500;
const MAX_CUSTOM_INSTRUCTION = 500;

const createError = (message, statusCode = 400, code, data) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (code) error.code = code;
    if (data !== undefined) error.data = data;
    return error;
};

const notFound = (message) => createError(message, 404);
const badRequest = (message) => createError(message, 400);
const conflict = (message, code) => createError(message, 409, code);

const startOfTodayUtc = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const shapeDraft = (draft) => ({
    id: String(draft._id),
    emailId: String(draft.email),
    replyType: draft.replyType || '',
    tone: draft.tone,
    language: draft.language,
    subject: draft.subject || '',
    body: draft.body || '',
    assumptions: draft.assumptions || [],
    placeholders: inboxDraftAiService.findPlaceholders(draft.body || ''),
    to: draft.to || [],
    cc: draft.cc || [],
    status: draft.status,
    gmailDraftId: draft.gmailDraftId || null,
    threadId: draft.threadId || null,
    sentAt: draft.sentAt || null
});

const loadEmail = async (user, emailId) => {
    const email = await InboxEmail.findOne({
        _id: emailId,
        school: user.school,
        user: user._id
    }).lean();
    if (!email) throw notFound('Email not found.');
    return email;
};

const loadDraft = async (user, draftId) => {
    const draft = await InboxReplyDraft.findOne({
        _id: draftId,
        school: user.school,
        user: user._id
    }).lean();
    if (!draft) throw notFound('Reply draft not found.');
    return draft;
};

const selfAddressFor = async (userId) => {
    const token = await gmailOAuthService.getTokenStatus(userId);
    return token?.email || '';
};

const replyInstructionFor = (replyType, customInstruction, settings) => {
    const id = String(replyType || '').trim();
    const builtIn = findInboxReplyType(id);
    if (builtIn) {
        if (id !== 'custom') return builtIn.instruction;
        const instruction = String(customInstruction || '').trim();
        if (!instruction) throw badRequest('Write what the reply should say.');
        return instruction.slice(0, MAX_CUSTOM_INSTRUCTION);
    }
    const custom = (settings.customReplyTypes || []).find((type) => type.id === id);
    if (custom) return custom.instruction;
    throw badRequest('Choose a reply type from the list.');
};

export const estimateDraft = async (user, emailId) => {
    await loadEmail(user, emailId);
    const [markupPercent, badge] = await Promise.all([
        getMarkupPercent(),
        getCreditBadge({ schoolId: user.school, userId: user._id })
    ]);
    return {
        estimateCents: estimateDraftCents({ markupPercent }),
        creditBalanceCents: badge.balanceCents
    };
};

export const generateDraft = async (user, emailId, body = {}) => {
    const [email, settings, platform] = await Promise.all([
        loadEmail(user, emailId),
        InboxAssistantSettings.findOne({ school: user.school, user: user._id }).lean(),
        getPlatformInboxSettings()
    ]);

    if (email.bodyPurgedAt) {
        throw conflict('The original text is no longer stored. Open the email in Gmail to reply.');
    }
    if (!settings?.optedIn) {
        throw conflict('Turn on Inbox Assistant first.', 'INBOX_NOT_OPTED_IN');
    }
    if (body.tone !== undefined && !TONES.has(body.tone)) {
        throw badRequest('Choose a writing tone from the list.');
    }

    const usedToday = await AiCreditEntry.countDocuments({
        school: user.school,
        user: user._id,
        type: 'usage',
        feature: 'inbox_draft',
        createdAt: { $gte: startOfTodayUtc() }
    });
    if (usedToday >= Number(platform.maxDraftsPerDay || 0)) {
        throw createError(
            `You have used today's ${platform.maxDraftsPerDay} reply drafts. Try again tomorrow.`,
            429,
            'DRAFT_DAILY_LIMIT'
        );
    }

    await assertHasCredit({ schoolId: user.school, userId: user._id });

    const tone = TONES.has(body.tone) ? body.tone : (settings.tone || 'professional');
    const language = inboxDraftAiService.targetLanguage(body.language, email.language);
    const replyInstruction = replyInstructionFor(body.replyType, body.customInstruction, settings);
    const note = String(body.note || '').trim().slice(0, MAX_NOTE);

    const [thread, previousDraft] = await Promise.all([
        InboxEmail.find({
            school: user.school,
            user: user._id,
            threadId: email.threadId,
            _id: { $ne: email._id }
        })
            .sort({ receivedAt: -1 })
            .limit(5)
            .select('fromName fromEmail summary')
            .lean(),
        InboxReplyDraft.findOne({
            school: user.school,
            user: user._id,
            email: email._id,
            status: 'draft'
        }).lean()
    ]);

    const result = await inboxDraftAiService.generate({
        user,
        email,
        thread,
        replyInstruction,
        note,
        tone,
        language,
        teacherName: user.fullName || user.firstName || '',
        previousDraft
    });

    const normalized = inboxDraftAiService.normalizeReplyDraft({
        parsed: result.parsed,
        originalSubject: email.subject,
        sources: [email.subject, email.bodyText, note],
        signature: settings.signature || ''
    });
    if (!normalized) {
        await markUsageOutcome({ entryId: result.usageEntryId, outcome: 'unusable' });
        throw Object.assign(new Error('I could not write a draft this time. Try again.'), {
            statusCode: 502,
            expose: true
        });
    }

    const recipients = resolveRecipients(email, {
        includeCc: Boolean(settings.includeCcByDefault),
        selfAddress: await selfAddressFor(user._id)
    });

    const saved = await InboxReplyDraft.findOneAndUpdate(
        {
            school: user.school,
            user: user._id,
            email: email._id,
            status: 'draft'
        },
        {
            $set: {
                replyType: String(body.replyType || ''),
                tone,
                language,
                subject: normalized.subject,
                body: normalized.body,
                assumptions: normalized.assumptions,
                to: recipients.to,
                cc: recipients.cc,
                aiUsageEntryId: result.usageEntryId || null
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return shapeDraft(saved);
};

export const updateDraft = async (user, draftId, body = {}) => {
    const draft = await loadDraft(user, draftId);
    if (draft.status !== 'draft') {
        throw conflict('This reply was already sent or is being sent.');
    }

    const patch = {};
    if (body.subject !== undefined) {
        const subject = String(body.subject).trim();
        if (!subject || subject.length > 300) {
            throw badRequest('The subject needs between 1 and 300 characters.');
        }
        patch.subject = subject;
    }
    if (body.body !== undefined) {
        if (typeof body.body !== 'string' || !body.body.trim() || body.body.length > 8000) {
            throw badRequest('The reply text needs between 1 and 8000 characters.');
        }
        patch.body = body.body;
    }
    if (body.includeCc !== undefined) {
        if (typeof body.includeCc !== 'boolean') {
            throw badRequest('Choose whether to include Cc.');
        }
        const email = await loadEmail(user, draft.email);
        const recipients = resolveRecipients(email, {
            includeCc: body.includeCc,
            selfAddress: await selfAddressFor(user._id)
        });
        patch.to = recipients.to;
        patch.cc = recipients.cc;
    }

    const saved = await InboxReplyDraft.findOneAndUpdate(
        { _id: draft._id, school: user.school, user: user._id, status: 'draft' },
        { $set: patch },
        { new: true }
    ).lean();
    if (!saved) throw conflict('This reply was already sent or is being sent.');
    return shapeDraft(saved);
};

export const discardDraft = async (user, draftId) => {
    const draft = await loadDraft(user, draftId);
    if (draft.status !== 'draft') {
        throw conflict('This reply was already sent or is being sent.');
    }

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

    const saved = await InboxReplyDraft.findOneAndUpdate(
        { _id: draft._id, school: user.school, user: user._id, status: 'draft' },
        { $set: { status: 'discarded', gmailDraftId: null } },
        { new: true }
    ).lean();
    if (!saved) throw conflict('This reply was already sent or is being sent.');
    return shapeDraft(saved);
};

export const saveToGmailDraft = async (user, draftId) => {
    const draft = await loadDraft(user, draftId);
    if (draft.status !== 'draft') {
        throw conflict('This reply was already sent or is being sent.');
    }
    if (!String(draft.body || '').trim() || !String(draft.subject || '').trim()) {
        throw badRequest('Write a subject and a body before saving to Gmail.');
    }

    const email = await loadEmail(user, draft.email);
    const mailOptions = {
        to: (draft.to || []).join(', '),
        cc: (draft.cc || []).join(', '),
        subject: draft.subject,
        text: draft.body,
        html: buildReplyHtml(draft.body, draft.language),
        inReplyTo: email.messageIdHeader || undefined,
        references: [email.referencesHeader, email.messageIdHeader].filter(Boolean).join(' ') || undefined,
        threadId: email.threadId || undefined
    };

    if (draft.gmailDraftId) {
        await gmailOAuthService.deleteGmailDraft(user._id, draft.gmailDraftId);
    }
    const created = await gmailOAuthService.createGmailDraft(user._id, mailOptions);

    const saved = await InboxReplyDraft.findOneAndUpdate(
        { _id: draft._id, school: user.school, user: user._id, status: 'draft' },
        { $set: { gmailDraftId: created.draftId } },
        { new: true }
    ).lean();
    if (!saved) throw conflict('This reply was already sent or is being sent.');
    return { gmailDraftId: created.draftId };
};

export default {
    estimateDraft,
    generateDraft,
    updateDraft,
    discardDraft,
    saveToGmailDraft,
    shapeDraft
};
