import multer from 'multer';
import path from 'path';

const MAX_TEMPLATE_FILE_SIZE = 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['text/csv', 'application/vnd.ms-excel']);

export const isAllowedTemplateUpload = (file = {}) => {
    const mimeType = String(file.mimetype || '').toLowerCase();
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    return extension === '.csv' && (!mimeType || ALLOWED_MIME_TYPES.has(mimeType));
};

const uploadImportTemplate = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_TEMPLATE_FILE_SIZE, files: 1 },
    fileFilter: (req, file, cb) => {
        void req;
        if (isAllowedTemplateUpload(file)) {
            cb(null, true);
            return;
        }
        cb(new Error('Invalid CSV file type. Allowed format: .csv'), false);
    }
});

export default uploadImportTemplate;
