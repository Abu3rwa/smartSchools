import CommunicationEmailAttachment from '../../models/CommunicationEmailAttachment.js';
import {
    buildCommunicationLogPayload,
    buildRecipientSnapshot,
    buildRecipientSummary,
    buildScheduleAttachmentsSnapshot,
    createHttpError
} from './dispatchFormatting.js';

export const resolveOwnedAttachments = async ({
    attachmentIds = [],
    schoolId,
    userId,
    attachmentModel = CommunicationEmailAttachment
}) => {
    if (attachmentIds.length === 0) return [];

    const attachments = await attachmentModel.find({
        _id: { $in: attachmentIds },
        school: schoolId,
        uploadedBy: userId
    });

    if (attachments.length !== attachmentIds.length) {
        throw createHttpError(400, 'One or more attachments are invalid or outside your scope');
    }
    return attachments;
};

export const markAttachmentsUsed = async ({
    attachments = [],
    attachmentModel = CommunicationEmailAttachment
}) => {
    if (attachments.length === 0) return;
    await attachmentModel.updateMany(
        { _id: { $in: attachments.map((attachment) => attachment._id) } },
        { $set: { isUsed: true, usedAt: new Date() } }
    );
};

export const createBlockedAttemptLog = async ({
    req,
    senderIdentity,
    subject,
    bodyHtml,
    preview,
    blockedTokenKeys,
    attachments,
    logModel
}) => {
    const recipientSummary = buildRecipientSummary({
        previewSummary: preview.recipientSummary,
        totalSent: 0,
        totalFailed: 0,
        totalResolved: 0
    });
    const payload = buildCommunicationLogPayload({
        req,
        senderIdentity,
        subject,
        bodyHtml,
        preview,
        blockedTokenKeys,
        attachments,
        status: 'blocked',
        sendResults: preview.blockedTokens || [],
        recipientSummary
    });
    await logModel.create(payload);
};

const createScheduledLog = async ({
    req,
    senderIdentity,
    subject,
    bodyHtml,
    preview,
    blockedTokenKeys,
    attachments,
    scheduleInput,
    recipientSummary,
    logModel
}) => logModel.create(buildCommunicationLogPayload({
    req,
    senderIdentity,
    subject,
    bodyHtml,
    preview,
    blockedTokenKeys,
    attachments,
    status: 'scheduled',
    sendResults: [{
        success: true,
        count: 0,
        note: 'scheduled',
        scheduledFor: scheduleInput.scheduledFor
    }],
    scheduledFor: scheduleInput.scheduledFor,
    clientTimeZone: scheduleInput.clientTimeZone,
    recipientSummary
}));

const createScheduledRecord = async ({
    req,
    senderIdentity,
    subject,
    bodyHtml,
    preview,
    blockedTokenKeys,
    attachments,
    scheduleInput,
    recipientSummary,
    scheduledLogId,
    scheduleModel
}) => scheduleModel.create({
    ...buildCommunicationLogPayload({
        req,
        senderIdentity,
        subject,
        bodyHtml,
        preview,
        blockedTokenKeys,
        attachments,
        status: 'scheduled',
        sendResults: [],
        scheduledFor: scheduleInput.scheduledFor,
        clientTimeZone: scheduleInput.clientTimeZone,
        recipientSummary
    }),
    attachments: buildScheduleAttachmentsSnapshot(attachments),
    recipientSnapshot: buildRecipientSnapshot(preview.recipients),
    scheduledForLocal: scheduleInput.scheduledForLocal,
    log: scheduledLogId
});

const createScheduledRecordWithRollback = async ({
    req,
    senderIdentity,
    subject,
    bodyHtml,
    preview,
    blockedTokenKeys,
    attachments,
    scheduleInput,
    recipientSummary,
    scheduledLog,
    scheduleModel,
    logModel
}) => {
    try {
        await createScheduledRecord({
            req,
            senderIdentity,
            subject,
            bodyHtml,
            preview,
            blockedTokenKeys,
            attachments,
            scheduleInput,
            recipientSummary,
            scheduledLogId: scheduledLog._id,
            scheduleModel
        });
    } catch (error) {
        await logModel.deleteOne({ _id: scheduledLog._id });
        throw error;
    }
};

const buildScheduledOperationContext = ({
    req,
    senderIdentity,
    subject,
    bodyHtml,
    preview,
    blockedTokenKeys,
    attachments,
    scheduleInput
}) => ({
    req,
    senderIdentity,
    subject,
    bodyHtml,
    preview,
    blockedTokenKeys,
    attachments,
    scheduleInput
});

export const createScheduledEmailRecords = async ({
    req,
    senderIdentity,
    subject,
    bodyHtml,
    preview,
    blockedTokenKeys,
    attachments,
    scheduleInput,
    logModel,
    scheduleModel
}) => {
    const operationContext = buildScheduledOperationContext({
        req,
        senderIdentity,
        subject,
        bodyHtml,
        preview,
        blockedTokenKeys,
        attachments,
        scheduleInput
    });
    const recipientSummary = buildRecipientSummary({
        previewSummary: preview.recipientSummary,
        totalSent: 0,
        totalFailed: 0
    });

    const scheduledLog = await createScheduledLog({ ...operationContext, recipientSummary, logModel });
    await createScheduledRecordWithRollback({
        ...operationContext,
        recipientSummary,
        scheduledLog,
        scheduleModel,
        logModel
    });
};

export const createImmediateSendLog = async ({
    req,
    senderIdentity,
    subject,
    preview,
    blockedTokenKeys,
    attachments,
    sendResult,
    logModel
}) => {
    const recipientSummary = buildRecipientSummary({
        previewSummary: preview.recipientSummary,
        totalSent: sendResult.totalSent,
        totalFailed: sendResult.totalFailed
    });

    const payload = buildCommunicationLogPayload({
        req,
        senderIdentity,
        subject: sendResult.subject || subject,
        bodyHtml: sendResult.htmlBody,
        preview,
        blockedTokenKeys,
        attachments,
        status: sendResult.status,
        sendResults: sendResult.batchResults || [],
        recipientSummary
    });
    await logModel.create(payload);
};
