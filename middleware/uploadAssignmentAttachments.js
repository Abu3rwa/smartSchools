import multer from 'multer';
import path from 'path';

const storage = multer.memoryStorage();

const ALLOWED_MIMES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
]);

const ALLOWED_EXTENSIONS = new Set([
    '.pdf', '.docx', '.pptx', '.xlsx',
    '.jpg', '.jpeg', '.png', '.webp', '.gif'
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

const fileFilter = (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    if (ALLOWED_MIMES.has(mime) && ALLOWED_EXTENSIONS.has(ext)) {
        cb(null, true);
    } else {
        cb(
            new Error('Invalid file type. Allowed: pdf, docx, pptx, xlsx, jpg, jpeg, png, webp, gif.'),
            false
        );
    }
};

export const uploadAssignmentAttachments = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
    fileFilter
});
