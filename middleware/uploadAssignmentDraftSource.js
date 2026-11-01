import multer from 'multer';
import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES } from '../services/documentTextExtraction.js';

/**
 * One PDF or photo used only as question material. Memory storage on purpose:
 * the buffer is parsed in the request and discarded, never persisted.
 */

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: DOCUMENT_MAX_BYTES,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        void req;
        const mimeType = String(file.mimetype || '').toLowerCase();
        if (DOCUMENT_MIME_TYPES.has(mimeType)) {
            cb(null, true);
            return;
        }
        const error = new Error('Upload a PDF, JPG, PNG or WebP file.');
        error.code = 'DOCUMENT_TYPE_UNSUPPORTED';
        error.statusCode = 400;
        cb(error, false);
    }
}).single('materialFile');

export const uploadAssignmentDraftSource = (req, res, next) => {
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

export default uploadAssignmentDraftSource;
