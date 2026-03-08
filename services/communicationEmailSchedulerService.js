import CommunicationEmailLog from '../models/CommunicationEmailLog.js';
import CommunicationEmailSchedule from '../models/CommunicationEmailSchedule.js';
import { resolveSenderIdentity, sendComposedEmail } from './communicationEmailService.js';
import logger from '../utils/logger.js';

const toId = (value) => (value == null ? '' : String(value));

const toAttachmentSendPayload = (items = []) => (
    (Array.isArray(items) ? items : []).map((item) => ({
        originalName: item.filename || '',
        mimeType: item.mimeType || '',
        size: Number(item.size || 0),
        storagePath: item.storagePath || ''
    }))
);

const toRecipientPayload = (items = []) => (
    (Array.isArray(items) ? items : [])
        .map((item) => ({
            email: item.email || '',
            category: item.category || 'students',
            displayName: item.displayName || ''
        }))
        .filter((item) => String(item.email || '').trim())
);

export const processDueScheduledCommunicationEmails = async ({
    now = new Date(),
    limit = 25,
    scheduleModel = CommunicationEmailSchedule,
    logModel = CommunicationEmailLog
} = {}) => {
    const maxItems = Math.max(1, Math.min(Number(limit) || 25, 100));
    const stats = {
        claimed: 0,
        sent: 0,
        partial: 0,
        failed: 0
    };

    for (let index = 0; index < maxItems; index += 1) {
        const claimed = await scheduleModel.findOneAndUpdate(
            {
                status: 'scheduled',
                scheduledFor: { $lte: now }
            },
            {
                $set: {
                    status: 'processing',
                    processingStartedAt: new Date(),
                    lastError: ''
                },
                $inc: { attempts: 1 }
            },
            {
                new: true,
                sort: { scheduledFor: 1, createdAt: 1 }
            }
        );
        if (!claimed) break;

        stats.claimed += 1;

        const scheduleId = toId(claimed._id);
        const recipientPayload = toRecipientPayload(claimed.recipientSnapshot);
        const attachmentPayload = toAttachmentSendPayload(claimed.attachments);
        const senderIdentity = await resolveSenderIdentity({
            senderUserId: claimed.sender,
            fallbackUser: {
                firstName: claimed.fromLabel,
                email: claimed.senderEmail,
                gmailTokens: { email: claimed.senderEmail }
            }
        });

        try {
            const sendResult = await sendComposedEmail({
                senderUserId: toId(claimed.sender),
                senderDisplayName: senderIdentity.senderDisplayName || claimed.fromLabel,
                senderEmail: senderIdentity.senderEmail || claimed.senderEmail,
                subject: claimed.subject,
                htmlBody: claimed.bodyHtmlSnapshot,
                recipients: recipientPayload,
                attachments: attachmentPayload
            });

            const nextStatus = sendResult.status || 'failed';
            const mergedRecipientSummary = {
                ...(claimed.recipientSummary || {}),
                totalSent: sendResult.totalSent || 0,
                totalFailed: sendResult.totalFailed || 0
            };

            await scheduleModel.updateOne(
                { _id: claimed._id, status: 'processing' },
                {
                    $set: {
                        status: nextStatus,
                        senderEmail: senderIdentity.senderEmail || claimed.senderEmail,
                        fromLabel: senderIdentity.senderDisplayName || claimed.fromLabel,
                        processedAt: new Date(),
                        recipientSummary: mergedRecipientSummary,
                        sendResults: sendResult.batchResults || [],
                        lastError: ''
                    }
                }
            );

            if (claimed.log) {
                await logModel.updateOne(
                    { _id: claimed.log, school: claimed.school },
                    {
                        $set: {
                            status: nextStatus,
                            senderEmail: senderIdentity.senderEmail || claimed.senderEmail,
                            fromLabel: senderIdentity.senderDisplayName || claimed.fromLabel,
                            subject: sendResult.subject || claimed.subject,
                            bodyHtmlSnapshot: sendResult.htmlBody || claimed.bodyHtmlSnapshot,
                            bodyTextSnapshot: sendResult.textBody || claimed.bodyTextSnapshot,
                            recipientSummary: mergedRecipientSummary,
                            sendResults: sendResult.batchResults || [],
                            sentAt: new Date()
                        }
                    }
                );
            }

            if (nextStatus === 'sent') stats.sent += 1;
            else if (nextStatus === 'partial') stats.partial += 1;
            else stats.failed += 1;
        } catch (error) {
            const message = error?.message || 'Scheduled email send failed';
            await scheduleModel.updateOne(
                { _id: claimed._id, status: 'processing' },
                {
                    $set: {
                        status: 'failed',
                        processedAt: new Date(),
                        sendResults: [{ success: false, count: 0, error: message }],
                        lastError: message
                    }
                }
            );

            if (claimed.log) {
                const failedSummary = {
                    ...(claimed.recipientSummary || {}),
                    totalSent: 0,
                    totalFailed: Number(claimed.recipientSummary?.totalResolved || 0)
                };
                await logModel.updateOne(
                    { _id: claimed.log, school: claimed.school },
                    {
                        $set: {
                            status: 'failed',
                            recipientSummary: failedSummary,
                            sendResults: [{ success: false, count: 0, error: message }],
                            sentAt: new Date()
                        }
                    }
                );
            }

            stats.failed += 1;
            logger.error('communication_email_schedule_send_failed', {
                scheduleId,
                schoolId: toId(claimed.school),
                senderId: toId(claimed.sender),
                message
            });
        }
    }

    return stats;
};
