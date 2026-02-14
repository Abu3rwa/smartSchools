import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.pdf'];

const uploadDir = path.join(__dirname, '..', 'uploads', 'attendance-requests');

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname)?.toLowerCase() || '.bin';
        const safeExt = ALLOWED_EXT.includes(ext) ? ext : '.bin';
        const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`;
        cb(null, name);
    }
});

const fileFilter = (req, file, cb) => {
    const mime = file.mimetype;
    const ext = path.extname(file.originalname)?.toLowerCase();
    if (ALLOWED_MIMES.includes(mime) && ALLOWED_EXT.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only jpg, png, and pdf are allowed.'), false);
    }
};

export const uploadAttendanceRequestFile = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter
}).single('attachment');

/**
 * After multer runs, req.file is set. Build URL path for storing in DB.
 * Client will request: same origin + attachmentUrl (e.g. /uploads/attendance-requests/xxx.pdf)
 */
export function getAttachmentUrl(filename) {
    if (!filename) return null;
    return `/uploads/attendance-requests/${filename}`;
}
