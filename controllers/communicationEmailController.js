import { asyncHandler } from '../middleware/errorHandler.js';
import CommunicationEmailAttachment from '../models/CommunicationEmailAttachment.js';
import CommunicationEmailLog from '../models/CommunicationEmailLog.js';
import CommunicationEmailSchedule from '../models/CommunicationEmailSchedule.js';
import { deleteFile, downloadFile, uploadPrivateFile } from '../services/firebaseStorageService.js';
import {
    generateCommunicationEmailDraft,
    getComposerConfig,
    getRecipientSuggestions,
    hasValidEmailConnection,
    parseScheduledDeliveryInput,
    previewRecipients,
    readSuggestionParams,
    resolveAiDraftCapability,
    resolveSenderIdentity,
    sendComposedEmail
} from '../services/communicationEmailService.js';

const toId = (value) => (value == null ? '' : String(value));
const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

const toTokenLogItems = (items = []) => (
    (Array.isArray(items) ? items : []).map((item) => ({
        key: String(item?.key || ''),
        label: String(item?.label || item?.key || ''),
        tokenType: String(item?.tokenType || 'group'),
        audience: String(item?.audience || '')
    }))
);

const sanitizeTokenSelection = (body = {}) => ({
    toParents: Array.isArray(body?.toParents) ? body.toParents : [],
    toTeachers: Array.isArray(body?.toTeachers) ? body.toTeachers : [],
    toStudents: Array.isArray(body?.toStudents) ? body.toStudents : []
});

const toAttachmentIds = (value) => {
    const values = Array.isArray(value) ? value : [];
    const unique = new Set();
    for (const item of values) {
        const id = String(item || '').trim();
        if (!OBJECT_ID_PATTERN.test(id)) continue;
        unique.add(id);
    }
    return [...unique];
};

const sanitizeAttachmentName = (value = '') => (
    String(value || 'attachment')
        .replace(/[^\w.\-() ]+/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 120)
        || 'attachment'
);

const buildAttachmentStoragePath = ({ schoolId, userId, originalName }) => {
    const sanitized = sanitizeAttachmentName(originalName);
    return `schools/${schoolId}/communication-email/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitized}`;
};

const toAttachmentDownloadUrl = (attachmentId) => (
    `/api/communication-email/attachments/${attachmentId}/download`
);

const toAttachmentLogItems = (items = []) => (
    items.map((item) => ({
        filename: item.originalName || item.filename || 'attachment',
        mimeType: item.mimeType || item.mimetype || '',
        size: Number(item.size || 0)
    }))
);

const resolveOwnedAttachments = async (req, attachmentIds = []) => {
    if (!attachmentIds.length) return [];
    const attachments = await CommunicationEmailAttachment.find({
        _id: { $in: attachmentIds },
        school: req.schoolId,
        uploadedBy: req.user._id
    });
    if (attachments.length !== attachmentIds.length) {
        throw new Error('One or more attachments are invalid or outside your scope');
    }
    return attachments;
};

export const getCommunicationComposerConfigController = asyncHandler(async (req, res) => {
    const config = await getComposerConfig(req);
    if (!config.canUseComposer) {
        return res.status(403).json({
            success: false,
            message: 'You do not have communication scope to use the email composer'
        });
    }

    res.status(200).json({
        success: true,
        data: config
    });
});

export const getCommunicationRecipientSuggestionsController = asyncHandler(async (req, res) => {
    const { field, query, page, limit } = readSuggestionParams(req);
    const data = await getRecipientSuggestions(req, { field, query, page, limit });
    res.status(200).json({
        success: true,
        data
    });
});

export const previewCommunicationEmailRecipientsController = asyncHandler(async (req, res) => {
    const selection = sanitizeTokenSelection(req.body);
    const preview = await previewRecipients(req, selection);
    const blockedTokenCount = preview.blockedTokens?.length || 0;
    const hasBlocked = blockedTokenCount > 0;

    res.status(200).json({
        success: true,
        data: {
            ...preview,
            hasBlocked,
            blockedTokenCount
        }
    });
});

export const generateCommunicationEmailDraftController = asyncHandler(async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim();
    const tone = String(req.body?.tone || 'professional').trim();
    if (!prompt) {
        return res.status(400).json({
            success: false,
            message: 'Prompt is required'
        });
    }

    const aiDraftCapability = await resolveAiDraftCapability({
        schoolId: req.schoolId
    });
    if (!aiDraftCapability.canUse) {
        return res.status(403).json({
            success: false,
            message: aiDraftCapability.reason === 'plan_locked'
                ? 'AI Email Drafts are not available on the current subscription plan'
                : 'AI Email Drafts are disabled by your school administrator',
            code: aiDraftCapability.reason === 'plan_locked' ? 'FEATURE_LOCKED' : 'FEATURE_DISABLED',
            data: {
                aiDraft: aiDraftCapability
            }
        });
    }

    const selection = sanitizeTokenSelection(req.body);
    const senderIdentity = await resolveSenderIdentity({
        senderUserId: req.user._id,
        fallbackUser: req.user
    });
    const draft = await generateCommunicationEmailDraft({
        schoolId: req.schoolId,
        userId: req.user._id,
        prompt,
        tone,
        selection,
        senderDisplayName: senderIdentity.senderDisplayName
    });

    res.status(200).json({
        success: true,
        data: draft
    });
});

export const sendCommunicationEmailController = asyncHandler(async (req, res) => {
    const subject = String(req.body?.subject || '').trim();
    const bodyHtml = String(req.body?.bodyHtml || req.body?.body || '').trim();
    const scheduledForLocal = String(req.body?.scheduledForLocal || '').trim();
    const clientTimeZone = String(req.body?.clientTimeZone || '').trim();

    if (!subject) {
        return res.status(400).json({
            success: false,
            message: 'Subject is required'
        });
    }
    if (!bodyHtml) {
        return res.status(400).json({
            success: false,
            message: 'Email body is required'
        });
    }

    let scheduleInput = null;
    try {
        scheduleInput = parseScheduledDeliveryInput({
            scheduledForLocal,
            clientTimeZone
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || 'Invalid scheduling request'
        });
    }

    if (!hasValidEmailConnection(req.user)) {
        return res.status(400).json({
            success: false,
            message: 'Your Gmail account is not connected. Please connect Gmail before sending.'
        });
    }

    const senderIdentity = await resolveSenderIdentity({
        senderUserId: req.user._id,
        fallbackUser: req.user
    });
    if (!senderIdentity.senderEmail) {
        return res.status(400).json({
            success: false,
            message: 'Your sender email is not configured. Please connect Gmail before sending.'
        });
    }

    const selection = sanitizeTokenSelection(req.body);
    const attachmentIds = toAttachmentIds(req.body?.attachmentIds);
    let attachments = [];
    try {
        attachments = await resolveOwnedAttachments(req, attachmentIds);
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || 'Invalid attachments'
        });
    }
    const preview = await previewRecipients(req, selection);
    const blockedTokenKeys = (preview.blockedTokens || []).map((token) => token.key);

    if ((preview.blockedTokens || []).length > 0) {
        await CommunicationEmailLog.create({
            school: req.schoolId,
            sender: req.user._id,
            senderRole: req.user.role,
            senderEmail: senderIdentity.senderEmail,
            fromLabel: senderIdentity.senderDisplayName || senderIdentity.senderEmail,
            subject,
            bodyHtmlSnapshot: bodyHtml,
            bodyTextSnapshot: bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
            selectedTokens: {
                parents: toTokenLogItems(preview.selectedTokens?.parents),
                teachers: toTokenLogItems(preview.selectedTokens?.teachers),
                students: toTokenLogItems(preview.selectedTokens?.students)
            },
            blockedTokenKeys,
            recipientSummary: {
                students: 0,
                parents: 0,
                teachers: 0,
                duplicatesRemoved: preview.recipientSummary?.duplicatesRemoved || 0,
                invalidExcluded: preview.recipientSummary?.invalidExcluded || 0,
                totalResolved: 0,
                totalSent: 0,
                totalFailed: 0
            },
            permissionSnapshot: {
                role: req.user.role,
                permissions: req.user.permissions || [],
                scope: preview.accessSnapshot || {}
            },
            attachments: toAttachmentLogItems(attachments),
            scheduledFor: scheduleInput?.scheduledFor || null,
            clientTimeZone: scheduleInput?.clientTimeZone || '',
            status: 'blocked',
            sendResults: preview.blockedTokens || []
        });

        return res.status(403).json({
            success: false,
            message: 'One or more recipient tokens are outside your allowed scope',
            data: {
                blockedTokens: preview.blockedTokens || []
            }
        });
    }

    if (!preview.recipients || preview.recipients.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No valid recipients resolved from selected tokens'
        });
    }

    if (scheduleInput) {
        let scheduledLog = null;
        try {
            scheduledLog = await CommunicationEmailLog.create({
                school: req.schoolId,
                sender: req.user._id,
                senderRole: req.user.role,
                senderEmail: senderIdentity.senderEmail,
                fromLabel: senderIdentity.senderDisplayName || senderIdentity.senderEmail,
                subject,
                bodyHtmlSnapshot: bodyHtml,
                bodyTextSnapshot: bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
                selectedTokens: {
                    parents: toTokenLogItems(preview.selectedTokens?.parents),
                    teachers: toTokenLogItems(preview.selectedTokens?.teachers),
                    students: toTokenLogItems(preview.selectedTokens?.students)
                },
                blockedTokenKeys,
                recipientSummary: {
                    students: preview.recipientSummary?.students || 0,
                    parents: preview.recipientSummary?.parents || 0,
                    teachers: preview.recipientSummary?.teachers || 0,
                    duplicatesRemoved: preview.recipientSummary?.duplicatesRemoved || 0,
                    invalidExcluded: preview.recipientSummary?.invalidExcluded || 0,
                    totalResolved: preview.recipientSummary?.totalResolved || 0,
                    totalSent: 0,
                    totalFailed: 0
                },
                permissionSnapshot: {
                    role: req.user.role,
                    permissions: req.user.permissions || [],
                    scope: preview.accessSnapshot || {}
                },
                attachments: toAttachmentLogItems(attachments),
                scheduledFor: scheduleInput.scheduledFor,
                clientTimeZone: scheduleInput.clientTimeZone,
                status: 'scheduled',
                sentAt: null,
                sendResults: [{
                    success: true,
                    count: 0,
                    note: 'scheduled',
                    scheduledFor: scheduleInput.scheduledFor
                }]
            });

            await CommunicationEmailSchedule.create({
                school: req.schoolId,
                sender: req.user._id,
                senderRole: req.user.role,
                senderEmail: senderIdentity.senderEmail,
                fromLabel: senderIdentity.senderDisplayName || senderIdentity.senderEmail,
                subject,
                bodyHtmlSnapshot: bodyHtml,
                bodyTextSnapshot: bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
                selectedTokens: {
                    parents: toTokenLogItems(preview.selectedTokens?.parents),
                    teachers: toTokenLogItems(preview.selectedTokens?.teachers),
                    students: toTokenLogItems(preview.selectedTokens?.students)
                },
                blockedTokenKeys,
                recipientSummary: {
                    students: preview.recipientSummary?.students || 0,
                    parents: preview.recipientSummary?.parents || 0,
                    teachers: preview.recipientSummary?.teachers || 0,
                    duplicatesRemoved: preview.recipientSummary?.duplicatesRemoved || 0,
                    invalidExcluded: preview.recipientSummary?.invalidExcluded || 0,
                    totalResolved: preview.recipientSummary?.totalResolved || 0,
                    totalSent: 0,
                    totalFailed: 0
                },
                permissionSnapshot: {
                    role: req.user.role,
                    permissions: req.user.permissions || [],
                    scope: preview.accessSnapshot || {}
                },
                attachments: attachments.map((attachment) => ({
                    filename: attachment.originalName,
                    mimeType: attachment.mimeType,
                    size: attachment.size,
                    storagePath: attachment.storagePath || attachment.fileUrl
                })),
                recipientSnapshot: (preview.recipients || []).map((recipient) => ({
                    email: recipient.email,
                    category: recipient.category,
                    displayName: recipient.displayName
                })),
                scheduledFor: scheduleInput.scheduledFor,
                scheduledForLocal: scheduleInput.scheduledForLocal,
                clientTimeZone: scheduleInput.clientTimeZone,
                status: 'scheduled',
                log: scheduledLog._id
            });
        } catch (error) {
            if (scheduledLog?._id) {
                await CommunicationEmailLog.deleteOne({ _id: scheduledLog._id });
            }
            throw error;
        }

        if (attachments.length > 0) {
            await CommunicationEmailAttachment.updateMany(
                { _id: { $in: attachments.map((attachment) => attachment._id) } },
                { $set: { isUsed: true, usedAt: new Date() } }
            );
        }

        return res.status(200).json({
            success: true,
            message: 'Email scheduled successfully',
            data: {
                status: 'scheduled',
                scheduledFor: scheduleInput.scheduledFor,
                clientTimeZone: scheduleInput.clientTimeZone,
                totalResolved: preview.recipientSummary?.totalResolved || 0,
                totalSent: 0,
                totalFailed: 0,
                recipientSummary: preview.recipientSummary,
                blockedTokens: []
            }
        });
    }

    const sendResult = await sendComposedEmail({
        senderUserId: toId(req.user._id),
        senderDisplayName: senderIdentity.senderDisplayName,
        senderEmail: senderIdentity.senderEmail,
        subject,
        htmlBody: bodyHtml,
        recipients: preview.recipients,
        attachments: attachments.map((attachment) => ({
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            size: attachment.size,
            storagePath: attachment.storagePath || attachment.fileUrl
        }))
    });

    await CommunicationEmailLog.create({
        school: req.schoolId,
        sender: req.user._id,
        senderRole: req.user.role,
        senderEmail: senderIdentity.senderEmail,
        fromLabel: senderIdentity.senderDisplayName || senderIdentity.senderEmail,
        subject: sendResult.subject,
        bodyHtmlSnapshot: sendResult.htmlBody,
        bodyTextSnapshot: sendResult.textBody,
        selectedTokens: {
            parents: toTokenLogItems(preview.selectedTokens?.parents),
            teachers: toTokenLogItems(preview.selectedTokens?.teachers),
            students: toTokenLogItems(preview.selectedTokens?.students)
        },
        blockedTokenKeys,
        recipientSummary: {
            students: preview.recipientSummary?.students || 0,
            parents: preview.recipientSummary?.parents || 0,
            teachers: preview.recipientSummary?.teachers || 0,
            duplicatesRemoved: preview.recipientSummary?.duplicatesRemoved || 0,
            invalidExcluded: preview.recipientSummary?.invalidExcluded || 0,
            totalResolved: preview.recipientSummary?.totalResolved || 0,
            totalSent: sendResult.totalSent || 0,
            totalFailed: sendResult.totalFailed || 0
        },
        permissionSnapshot: {
            role: req.user.role,
            permissions: req.user.permissions || [],
            scope: preview.accessSnapshot || {}
        },
        attachments: toAttachmentLogItems(attachments),
        scheduledFor: null,
        clientTimeZone: '',
        status: sendResult.status,
        sendResults: sendResult.batchResults || []
    });

    if (attachments.length > 0) {
        await CommunicationEmailAttachment.updateMany(
            { _id: { $in: attachments.map((attachment) => attachment._id) } },
            { $set: { isUsed: true, usedAt: new Date() } }
        );
    }

    res.status(200).json({
        success: true,
        message: sendResult.status === 'sent'
            ? 'Email sent successfully'
            : sendResult.status === 'partial'
                ? 'Email sent with partial failures'
                : 'Email sending failed',
        data: {
            status: sendResult.status,
            totalResolved: preview.recipientSummary?.totalResolved || 0,
            totalSent: sendResult.totalSent || 0,
            totalFailed: sendResult.totalFailed || 0,
            recipientSummary: preview.recipientSummary,
            blockedTokens: []
        }
    });
});

export const uploadCommunicationEmailAttachmentsController = asyncHandler(async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Please provide at least one attachment'
        });
    }

    const uploaded = [];
    try {
        for (const file of files) {
            const storagePath = buildAttachmentStoragePath({
                schoolId: req.schoolId,
                userId: req.user._id,
                originalName: file.originalname
            });
            const { fileRef } = await uploadPrivateFile(file.buffer, file.mimetype, storagePath);
            const attachment = await CommunicationEmailAttachment.create({
                school: req.schoolId,
                uploadedBy: req.user._id,
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                fileUrl: fileRef,
                storagePath
            });
            uploaded.push(attachment);
        }
    } catch (error) {
        for (const attachment of uploaded) {
            await deleteFile(attachment.storagePath || attachment.fileUrl);
            await CommunicationEmailAttachment.deleteOne({ _id: attachment._id });
        }
        throw error;
    }

    res.status(201).json({
        success: true,
        data: {
            attachments: uploaded.map((attachment) => ({
                id: attachment._id,
                originalName: attachment.originalName,
                mimeType: attachment.mimeType,
                size: attachment.size,
                downloadUrl: toAttachmentDownloadUrl(attachment._id)
            }))
        }
    });
});

export const removeCommunicationEmailAttachmentController = asyncHandler(async (req, res) => {
    const attachmentId = String(req.params.attachmentId || '').trim();
    if (!OBJECT_ID_PATTERN.test(attachmentId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid attachment id'
        });
    }

    const attachment = await CommunicationEmailAttachment.findOne({
        _id: attachmentId,
        school: req.schoolId,
        uploadedBy: req.user._id
    });
    if (!attachment) {
        return res.status(404).json({
            success: false,
            message: 'Attachment not found'
        });
    }

    if (attachment.isUsed) {
        return res.status(400).json({
            success: false,
            message: 'Attachment already used in a sent or scheduled email and cannot be removed'
        });
    }

    await deleteFile(attachment.storagePath || attachment.fileUrl);
    await CommunicationEmailAttachment.deleteOne({ _id: attachment._id });

    res.status(200).json({
        success: true,
        message: 'Attachment removed'
    });
});

export const downloadCommunicationEmailAttachmentController = asyncHandler(async (req, res) => {
    const attachmentId = String(req.params.attachmentId || '').trim();
    if (!OBJECT_ID_PATTERN.test(attachmentId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid attachment id'
        });
    }

    const attachment = await CommunicationEmailAttachment.findOne({
        _id: attachmentId,
        school: req.schoolId,
        uploadedBy: req.user._id
    }).lean();
    if (!attachment) {
        return res.status(404).json({
            success: false,
            message: 'Attachment not found'
        });
    }

    const storageRef = attachment.storagePath || attachment.fileUrl;
    const { buffer, contentType } = await downloadFile(storageRef);
    const safeName = sanitizeAttachmentName(attachment.originalName || 'attachment');
    const encodedName = encodeURIComponent(safeName).replace(
        /['()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );

    res.setHeader('Content-Type', contentType || attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`
    );
    res.status(200).send(buffer);
});

export const getCommunicationEmailHistoryController = asyncHandler(async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) > 0 ? Number.parseInt(req.query.page, 10) : 1;
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);

    const canViewSchoolLogs = req.user.role === 'admin' || req.user.role === 'super_admin';
    const filter = {
        school: req.schoolId,
        ...(canViewSchoolLogs ? {} : { sender: req.user._id })
    };

    const [items, total] = await Promise.all([
        CommunicationEmailLog.find(filter)
            .sort({ sentAt: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('sender senderRole senderEmail fromLabel subject selectedTokens recipientSummary status sentAt scheduledFor clientTimeZone createdAt')
            .populate('sender', 'firstName lastName email role')
            .lean(),
        CommunicationEmailLog.countDocuments(filter)
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);
    res.status(200).json({
        success: true,
        data: {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        }
    });
});
