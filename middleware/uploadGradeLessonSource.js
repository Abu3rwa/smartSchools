import multer from 'multer';
import { DOCUMENT_MAX_BYTES } from '../services/documentTextExtraction.js';

const ALLOWED_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        void req;
        const mimeType = String(file.mimetype || '').toLowerCase();
        if (ALLOWED_TYPES.has(mimeType)) {
            cb(null, true);
            return;
        }
        const error = new Error('Upload a PDF file.');
        error.code = 'LESSON_SOURCE_TYPE_UNSUPPORTED';
        error.statusCode = 400;
        cb(error, false);
    }
}).single('materialFile');

export const uploadGradeLessonSource = (req, res, next) => {
    upload(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        if (error.code === 'LIMIT_FILE_SIZE') {
            error.message = 'The file is too large. Upload a file under 10 MB.';
            error.code = 'DOCUMENT_TOO_LARGE';
        }
        error.statusCode = error.statusCode || 400;
        next(error);
    });
};

export default uploadGradeLessonSource;