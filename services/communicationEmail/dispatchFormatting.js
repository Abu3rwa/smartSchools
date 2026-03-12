import { hasValidEmailConnection, parseScheduledDeliveryInput } from '../communicationEmailService.js';

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

const asArray = (value) => (Array.isArray(value) ? value : []);
const toStringOr = (value, fallback = '') => String(value ?? fallback);
const toNumberOrZero = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const toId = (value) => (value == null ? '' : String(value));
export const toRequestString = (value, fallback = '') => toStringOr(value, fallback).trim();
export const resolveBodyHtmlInput = (body = {}) => toRequestString(body?.bodyHtml, body?.body ?? '');

export const createHttpError = (statusCode, message, details = null) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (details) {
        error.details = details;
    }
    return error;
};

export const sanitizeTokenSelection = (body = {}) => ({
    toParents: asArray(body?.toParents),
    toTeachers: asArray(body?.toTeachers),
    toStudents: asArray(body?.toStudents)
});

export const normalizeAttachmentIds = (value) => {
    const unique = new Set();
    for (const item of asArray(value)) {
        const id = toStringOr(item).trim();
        if (OBJECT_ID_PATTERN.test(id)) {
            unique.add(id);
        }
    }
    return [...unique];
};

const toTokenLogItems = (items = []) => asArray(items).map((item) => ({
    key: toStringOr(item?.key),
    label: toStringOr(item?.label, item?.key ?? ''),
    tokenType: toStringOr(item?.tokenType, 'group'),
    audience: toStringOr(item?.audience)
}));

const toAttachmentLogItems = (items = []) => asArray(items).map((item) => ({
    filename: toStringOr(item.originalName, item.filename ?? 'attachment'),
    mimeType: toStringOr(item.mimeType, item.mimetype ?? ''),
    size: toNumberOrZero(item.size)
}));

export const buildScheduleAttachmentsSnapshot = (attachments = []) => asArray(attachments).map((attachment) => ({
    filename: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    storagePath: attachment.storagePath || attachment.fileUrl
}));

export const buildRecipientSnapshot = (recipients = []) => asArray(recipients).map((recipient) => ({
    email: recipient.email,
    category: recipient.category,
    displayName: recipient.displayName
}));

const normalizeBodyText = (value = '') => (
    toStringOr(value)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
);

export const buildRecipientSummary = ({
    previewSummary = {},
    totalSent = 0,
    totalFailed = 0,
    totalResolved = null
} = {}) => {
    const summary = previewSummary || {};
    return {
        students: toNumberOrZero(summary.students),
        parents: toNumberOrZero(summary.parents),
        teachers: toNumberOrZero(summary.teachers),
        duplicatesRemoved: toNumberOrZero(summary.duplicatesRemoved),
        invalidExcluded: toNumberOrZero(summary.invalidExcluded),
        totalResolved: totalResolved == null ? toNumberOrZero(summary.totalResolved) : toNumberOrZero(totalResolved),
        totalSent: toNumberOrZero(totalSent),
        totalFailed: toNumberOrZero(totalFailed)
    };
};

const buildPermissionSnapshot = (req, preview) => ({
    role: req.user.role,
    permissions: req.user.permissions || [],
    scope: preview.accessSnapshot || {}
});

export const buildCommunicationLogPayload = ({
    req,
    senderIdentity,
    subject,
    bodyHtml,
    preview,
    blockedTokenKeys = [],
    attachments = [],
    status,
    sendResults = [],
    scheduledFor = null,
    clientTimeZone = '',
    recipientSummary
}) => ({
    school: req.schoolId,
    sender: req.user._id,
    senderRole: req.user.role,
    senderEmail: senderIdentity.senderEmail,
    fromLabel: senderIdentity.senderDisplayName || senderIdentity.senderEmail,
    subject,
    bodyHtmlSnapshot: bodyHtml,
    bodyTextSnapshot: normalizeBodyText(bodyHtml),
    selectedTokens: {
        parents: toTokenLogItems(preview.selectedTokens?.parents),
        teachers: toTokenLogItems(preview.selectedTokens?.teachers),
        students: toTokenLogItems(preview.selectedTokens?.students)
    },
    blockedTokenKeys,
    recipientSummary,
    permissionSnapshot: buildPermissionSnapshot(req, preview),
    attachments: toAttachmentLogItems(attachments),
    scheduledFor,
    clientTimeZone,
    status,
    sendResults
});

export const buildBlockedTokenKeys = (blockedTokens = []) => (
    asArray(blockedTokens).map((token) => toStringOr(token?.key).trim()).filter(Boolean)
);

export const buildBlockedResponse = (blockedTokens = []) => ({
    statusCode: 403,
    body: {
        success: false,
        message: 'One or more recipient tokens are outside your allowed scope',
        data: {
            blockedTokens
        }
    }
});

export const buildScheduledResponse = ({ scheduleInput, preview }) => ({
    statusCode: 200,
    body: {
        success: true,
        message: 'Email scheduled successfully',
        data: {
            status: 'scheduled',
            scheduledFor: scheduleInput.scheduledFor,
            clientTimeZone: scheduleInput.clientTimeZone,
            totalResolved: toNumberOrZero(preview.recipientSummary?.totalResolved),
            totalSent: 0,
            totalFailed: 0,
            recipientSummary: preview.recipientSummary,
            blockedTokens: []
        }
    }
});

const buildSendResultMessage = (status) => {
    if (status === 'sent') return 'Email sent successfully';
    if (status === 'partial') return 'Email sent with partial failures';
    return 'Email sending failed';
};

export const buildImmediateSendResponse = ({ sendResult, preview }) => ({
    statusCode: 200,
    body: {
        success: true,
        message: buildSendResultMessage(sendResult.status),
        data: {
            status: sendResult.status,
            totalResolved: toNumberOrZero(preview.recipientSummary?.totalResolved),
            totalSent: toNumberOrZero(sendResult.totalSent),
            totalFailed: toNumberOrZero(sendResult.totalFailed),
            recipientSummary: preview.recipientSummary,
            blockedTokens: []
        }
    }
});

export const ensureSubjectAndBody = ({ subject, bodyHtml }) => {
    if (!subject) {
        throw createHttpError(400, 'Subject is required');
    }
    if (!bodyHtml) {
        throw createHttpError(400, 'Email body is required');
    }
};

export const resolveScheduleInput = ({
    scheduledForLocal,
    clientTimeZone,
    scheduleParser = parseScheduledDeliveryInput
}) => {
    try {
        return scheduleParser({
            scheduledForLocal,
            clientTimeZone
        });
    } catch (error) {
        throw createHttpError(400, error.message || 'Invalid scheduling request');
    }
};

export const ensureConnectedEmail = (user) => {
    if (!hasValidEmailConnection(user)) {
        throw createHttpError(400, 'Your Gmail account is not connected. Please connect Gmail before sending.');
    }
};

export const ensureSenderEmail = (senderIdentity) => {
    if (!senderIdentity.senderEmail) {
        throw createHttpError(400, 'Your sender email is not configured. Please connect Gmail before sending.');
    }
};

export const ensureResolvedRecipients = (preview) => {
    const recipients = asArray(preview.recipients);
    if (recipients.length === 0) {
        throw createHttpError(400, 'No valid recipients resolved from selected tokens');
    }
};
