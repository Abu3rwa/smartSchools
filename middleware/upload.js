import multer from 'multer';
import path from 'path';

const storage = multer.memoryStorage();
const ALLOWED_IMAGE_MIMES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export const isAllowedImageUpload = (file = {}) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    return ALLOWED_IMAGE_MIMES.has(mime) && ALLOWED_IMAGE_EXTENSIONS.has(extension);
};

const fileFilter = (req, file, cb) => {
    void req;
    if (isAllowedImageUpload(file)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid image file type. Allowed formats: jpg, jpeg, png, webp, gif.'), false);
    }
};

// Configured for 5MB max upload
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter
});

// --- Presentation upload (PDF, DOCX, PPTX, images) ---
const ALLOWED_PRESENTATION_MIMES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
]);
const ALLOWED_PRESENTATION_EXTENSIONS = new Set([
    '.pdf', '.docx', '.pptx', '.jpg', '.jpeg', '.png', '.webp'
]);

const isAllowedPresentationUpload = (file = {}) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    return ALLOWED_PRESENTATION_MIMES.has(mime) && ALLOWED_PRESENTATION_EXTENSIONS.has(extension);
};

export const uploadPresentation = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        void req;
        if (isAllowedPresentationUpload(file)) {
            cb(null, true);
        } else {
            cb(
                new Error('Invalid file type. Allowed: pdf, docx, pptx, jpg, jpeg, png, webp.'),
                false
            );
        }
    }
});

// --- Worksheet template upload (images + PDF) ---
const ALLOWED_WORKSHEET_MIMES = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf'
]);
const ALLOWED_WORKSHEET_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf'
]);

export const isAllowedWorksheetUpload = (file = {}) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    return ALLOWED_WORKSHEET_MIMES.has(mime) && ALLOWED_WORKSHEET_EXTENSIONS.has(extension);
};

export const uploadWorksheetTemplate = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        void req;
        if (isAllowedWorksheetUpload(file)) {
            cb(null, true);
        } else {
            cb(
                new Error('Invalid file type. Allowed: jpg, jpeg, png, webp, gif, pdf.'),
                false
            );
        }
    }
});

export default upload;
