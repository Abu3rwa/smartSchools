import multer from 'multer';

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENT_FILES = 5;

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
]);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return cb(new Error('Unsupported attachment type'), false);
    }
    cb(null, true);
};

export const uploadCommunicationEmailAttachments = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_ATTACHMENT_SIZE_BYTES,
        files: MAX_ATTACHMENT_FILES
    }
}).array('attachments', MAX_ATTACHMENT_FILES);

export const communicationAttachmentLimits = {
    MAX_ATTACHMENT_SIZE_BYTES,
    MAX_ATTACHMENT_FILES
};

