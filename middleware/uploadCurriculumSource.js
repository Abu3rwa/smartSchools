import multer from 'multer';

export const CURRICULUM_SOURCE_ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
]);

const uploadCurriculumSourceFileFilter = (req, file, cb) => {
    void req;
    if (!CURRICULUM_SOURCE_ALLOWED_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())) {
        return cb(new Error('Unsupported curriculum source file type'), false);
    }
    return cb(null, true);
};

export const uploadCurriculumSourceFile = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024, // hard upper cap; school-level cap enforced in service
        files: 1
    },
    fileFilter: uploadCurriculumSourceFileFilter
}).single('sourceFile');

