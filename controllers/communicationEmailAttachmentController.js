import { asyncHandler } from '../middleware/errorHandler.js';
import CommunicationEmailAttachment from '../models/CommunicationEmailAttachment.js';
import { deleteFile, downloadFile, uploadPrivateFile } from '../services/firebaseStorageService.js';

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

const toAttachmentDownloadUrl = (attachmentId) => (
    `/api/communication-email/attachments/${attachmentId}/download`
);

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

const uploadSingleAttachment = async (req, file) => {
    const storagePath = buildAttachmentStoragePath({
        schoolId: req.schoolId,
        userId: req.user._id,
        originalName: file.originalname
    });
    const { fileRef } = await uploadPrivateFile(file.buffer, file.mimetype, storagePath);
    return CommunicationEmailAttachment.create({
        school: req.schoolId,
        uploadedBy: req.user._id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        fileUrl: fileRef,
        storagePath
    });
};

const deleteUploadedAttachments = async (items = []) => {
    for (const attachment of items) {
        await deleteFile(attachment.storagePath || attachment.fileUrl);
        await CommunicationEmailAttachment.deleteOne({ _id: attachment._id });
    }
};

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
            uploaded.push(await uploadSingleAttachment(req, file));
        }
    } catch (error) {
        await deleteUploadedAttachments(uploaded);
        throw error;
    }

    return res.status(201).json({
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

    return res.status(200).json({
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
    return res.status(200).send(buffer);
});
