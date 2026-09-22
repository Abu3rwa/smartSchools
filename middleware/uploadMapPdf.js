import multer from 'multer';
import path from 'path';

const allowedExtensions = new Set(['.csv']);

export const uploadMapPdf = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        void req;
        const extension = path.extname(String(file.originalname || '')).toLowerCase();
        const allowedMimeTypes = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'application/octet-stream', ''];
        if (allowedExtensions.has(extension) && allowedMimeTypes.includes(file.mimetype)) {
            callback(null, true);
            return;
        }
        callback(new Error('Only MAP CSV files are allowed.'));
    }
});
