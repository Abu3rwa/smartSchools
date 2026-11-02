import multer from 'multer';
import path from 'path';

const AUDIO_EXTENSIONS = new Set(['.webm', '.ogg', '.oga', '.mp3', '.m4a', '.mp4', '.wav', '.aac', '.flac']);

/**
 * One recording, 5 MB, audio only. It is held in memory and handed straight to
 * the speech provider; no upload directory is involved.
 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        void req;
        const extension = path.extname(String(file.originalname || '')).toLowerCase();
        if (/^audio\//i.test(String(file.mimetype || '')) || AUDIO_EXTENSIONS.has(extension)) {
            callback(null, true);
            return;
        }
        const error = new Error('Send an audio recording, not another kind of file.');
        error.statusCode = 400;
        error.code = 'FLUENCY_AUDIO_TYPE';
        callback(error);
    }
});

export const uploadFluencyAudio = (req, res, next) => {
    upload.single('audio')(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        if (error.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
                success: false,
                code: 'FLUENCY_AUDIO_TOO_LARGE',
                message: 'That recording is too large. Keep it under 5 MB.'
            });
            return;
        }
        if (error.statusCode) {
            res.status(error.statusCode).json({
                success: false,
                code: error.code,
                message: error.message
            });
            return;
        }
        res.status(400).json({
            success: false,
            code: 'FLUENCY_AUDIO_INVALID',
            message: 'That recording could not be read. Try again.'
        });
    });
};
