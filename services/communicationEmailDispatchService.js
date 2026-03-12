import CommunicationEmailAttachment from '../models/CommunicationEmailAttachment.js';
import CommunicationEmailLog from '../models/CommunicationEmailLog.js';
import CommunicationEmailSchedule from '../models/CommunicationEmailSchedule.js';
import {
    previewRecipients,
    resolveSenderIdentity,
    sendComposedEmail
} from './communicationEmailService.js';
import {
    buildBlockedResponse,
    buildBlockedTokenKeys,
    buildImmediateSendResponse,
    buildScheduleAttachmentsSnapshot,
    buildScheduledResponse,
    ensureConnectedEmail,
    ensureResolvedRecipients,
    ensureSenderEmail,
    ensureSubjectAndBody,
    normalizeAttachmentIds,
    resolveBodyHtmlInput,
    resolveScheduleInput,
    sanitizeTokenSelection,
    toRequestString,
    toId
} from './communicationEmail/dispatchFormatting.js';
import {
    createBlockedAttemptLog,
    createImmediateSendLog,
    createScheduledEmailRecords,
    markAttachmentsUsed,
    resolveOwnedAttachments
} from './communicationEmail/dispatchPersistence.js';

const buildSendRequestState = ({
    req,
    body,
    attachmentModel,
    scheduleParser
}) => {
    const subject = toRequestString(body?.subject);
    const bodyHtml = resolveBodyHtmlInput(body);
    const scheduledForLocal = toRequestString(body?.scheduledForLocal);
    const clientTimeZone = toRequestString(body?.clientTimeZone);

    ensureSubjectAndBody({ subject, bodyHtml });
    const scheduleInput = resolveScheduleInput({ scheduledForLocal, clientTimeZone, scheduleParser });
    ensureConnectedEmail(req.user);

    return {
        subject,
        bodyHtml,
        scheduleInput,
        attachmentModel
    };
};

const resolveSenderAndRecipientContext = async ({
    req,
    body,
    attachmentModel,
    senderResolver,
    recipientPreviewer
}) => {
    const senderIdentity = await senderResolver({
        senderUserId: req.user._id,
        fallbackUser: req.user
    });
    ensureSenderEmail(senderIdentity);

    const selection = sanitizeTokenSelection(body);
    const attachmentIds = normalizeAttachmentIds(body?.attachmentIds);
    const attachments = await resolveOwnedAttachments({
        attachmentIds,
        schoolId: req.schoolId,
        userId: req.user._id,
        attachmentModel
    });
    const preview = await recipientPreviewer(req, selection);
    const blockedTokens = Array.isArray(preview.blockedTokens) ? preview.blockedTokens : [];
    const blockedTokenKeys = buildBlockedTokenKeys(blockedTokens);

    return {
        senderIdentity,
        attachments,
        preview,
        blockedTokens,
        blockedTokenKeys
    };
};

const resolveDispatchContext = async ({
    req,
    body,
    attachmentModel,
    scheduleParser,
    senderResolver,
    recipientPreviewer
}) => {
    const baseState = buildSendRequestState({
        req,
        body,
        attachmentModel,
        scheduleParser
    });
    const senderRecipientContext = await resolveSenderAndRecipientContext({
        req,
        body,
        attachmentModel,
        senderResolver,
        recipientPreviewer
    });
    return {
        ...baseState,
        ...senderRecipientContext
    };
};

const runBlockedFlow = async ({
    req,
    context,
    logModel
}) => {
    await createBlockedAttemptLog({
        req,
        senderIdentity: context.senderIdentity,
        subject: context.subject,
        bodyHtml: context.bodyHtml,
        preview: context.preview,
        blockedTokenKeys: context.blockedTokenKeys,
        attachments: context.attachments,
        logModel
    });
    return buildBlockedResponse(context.blockedTokens);
};

const runScheduledFlow = async ({
    req,
    context,
    attachmentModel,
    logModel,
    scheduleModel
}) => {
    await createScheduledEmailRecords({
        req,
        senderIdentity: context.senderIdentity,
        subject: context.subject,
        bodyHtml: context.bodyHtml,
        preview: context.preview,
        blockedTokenKeys: context.blockedTokenKeys,
        attachments: context.attachments,
        scheduleInput: context.scheduleInput,
        logModel,
        scheduleModel
    });
    await markAttachmentsUsed({
        attachments: context.attachments,
        attachmentModel
    });
    return buildScheduledResponse({
        scheduleInput: context.scheduleInput,
        preview: context.preview
    });
};

const runImmediateSendFlow = async ({
    req,
    context,
    attachmentModel,
    composedEmailSender,
    logModel
}) => {
    const sendResult = await composedEmailSender({
        senderUserId: toId(req.user._id),
        senderDisplayName: context.senderIdentity.senderDisplayName,
        senderEmail: context.senderIdentity.senderEmail,
        subject: context.subject,
        htmlBody: context.bodyHtml,
        recipients: context.preview.recipients,
        attachments: buildScheduleAttachmentsSnapshot(context.attachments)
    });
    await createImmediateSendLog({
        req,
        senderIdentity: context.senderIdentity,
        subject: context.subject,
        preview: context.preview,
        blockedTokenKeys: context.blockedTokenKeys,
        attachments: context.attachments,
        sendResult,
        logModel
    });
    await markAttachmentsUsed({
        attachments: context.attachments,
        attachmentModel
    });
    return buildImmediateSendResponse({
        sendResult,
        preview: context.preview
    });
};

const resolveDispatchDependencies = (deps = {}) => ({
    attachmentModel: deps.attachmentModel || CommunicationEmailAttachment,
    logModel: deps.logModel || CommunicationEmailLog,
    scheduleModel: deps.scheduleModel || CommunicationEmailSchedule,
    scheduleParser: deps.scheduleParser,
    senderResolver: deps.senderResolver || resolveSenderIdentity,
    recipientPreviewer: deps.recipientPreviewer || previewRecipients,
    composedEmailSender: deps.composedEmailSender || sendComposedEmail
});

const runDispatchFlow = ({
    req,
    context,
    dependencies
}) => {
    if (context.blockedTokens.length > 0) {
        return runBlockedFlow({
            req,
            context,
            logModel: dependencies.logModel
        });
    }

    ensureResolvedRecipients(context.preview);
    if (context.scheduleInput) {
        return runScheduledFlow({
            req,
            context,
            attachmentModel: dependencies.attachmentModel,
            logModel: dependencies.logModel,
            scheduleModel: dependencies.scheduleModel
        });
    }

    return runImmediateSendFlow({
        req,
        context,
        attachmentModel: dependencies.attachmentModel,
        composedEmailSender: dependencies.composedEmailSender,
        logModel: dependencies.logModel
    });
};

export const processCommunicationEmailSend = async ({
    req,
    body = {},
    deps = {}
}) => {
    const dependencies = resolveDispatchDependencies(deps);
    const context = await resolveDispatchContext({
        req,
        body,
        attachmentModel: dependencies.attachmentModel,
        scheduleParser: dependencies.scheduleParser,
        senderResolver: dependencies.senderResolver,
        recipientPreviewer: dependencies.recipientPreviewer
    });
    return runDispatchFlow({
        req,
        context,
        dependencies
    });
};

export { normalizeAttachmentIds, resolveOwnedAttachments };
