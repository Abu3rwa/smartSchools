import multer from 'multer';
import path from 'path';

const allowedMimeTypes = new Set(['application/pdf', 'application/octet-stream']);
const MAX_SCHEDULE_BYTES = 10 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SCHEDULE_BYTES, files: 1 },
    fileFilter: (req, file, callback) => {
        void req;
        const extension = path.extname(String(file.originalname || '')).toLowerCase();
        if (extension !== '.pdf' || !allowedMimeTypes.has(String(file.mimetype || '').toLowerCase())) {
            callback(new Error('Upload a PDF file.'));
            return;
        }
        callback(null, true);
    }
});

/**
 * Multer reports its own failures (size, field name) as plain errors; map them
 * to JSON responses instead of letting the global handler turn them into 500s.
 */
export const acceptSchedulePdf = (req, res, next) => {
    upload.single('file')(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        const mapped = new Error(
            error.code === 'LIMIT_FILE_SIZE'
                ? 'The file is too large. Upload a PDF under 10 MB.'
                : (error.message || 'Upload a PDF file.')
        );
        mapped.statusCode = statusCode;
        mapped.code = error.code || 'SCHEDULE_UPLOAD_INVALID';
        mapped.expose = true;
        next(mapped);
    });
};
