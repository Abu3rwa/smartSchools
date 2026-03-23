import multer from 'multer';

export const LESSON_PLAN_ALLOWED_MIME_TYPES = new Set([
    'application/pdf'
]);

const fileFilter = (req, file, cb) => {
    void req;
    if (LESSON_PLAN_ALLOWED_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed for lesson plan context.'), false);
    }
};

export const uploadLessonPlanContext = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
    },
    fileFilter
}).single('materialFile');
