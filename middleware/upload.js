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

export default upload;
