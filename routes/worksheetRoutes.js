import express from 'express';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import upload from '../middleware/upload.js';
import { uploadWorksheetTemplate } from '../middleware/upload.js';
import {
    createWorksheet,
    getWorksheet,
    listWorksheets,
    updateWorksheet,
    deleteWorksheet,
    extractAnswerKey,
    addSubmission,
    addBatchSubmissions,
    getSubmissions,
    assignStudent,
    processOneSubmission,
    processAll,
    applyOverride,
    updateStatus,
    publishResults,
    syncToGradebook,
    unlinkGradebook,
    getConfiguration,
    updateConfiguration
} from '../controllers/worksheetController.js';

const router = express.Router();

/** Catch multer errors and return a structured 400 response */
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        const messages = {
            LIMIT_FILE_SIZE: 'File too large. Maximum size is 5 MB.',
            LIMIT_FILE_COUNT: 'Too many files. Maximum is 30 files per upload.',
            LIMIT_UNEXPECTED_FILE: 'Unexpected file field.'
        };
        return res.status(400).json({ success: false, message: messages[err.code] || err.message });
    }
    if (err?.message?.startsWith('Invalid')) {
        return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
};

// All routes require authentication + school context + feature flag
router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('worksheetChecker'));

// ─── Configuration (must be before /:id routes) ───────────────────────────────
router.get('/config', authorize('admin', 'teacher'), getConfiguration);
router.put('/config', authorize('admin'), updateConfiguration);

// ─── Teacher Override (must be before /:id routes) ────────────────────────────
router.put(
    '/submissions/:submissionId/override',
    authorize('teacher', 'admin'),
    applyOverride
);

// ─── Worksheet CRUD ───────────────────────────────────────────────────────────
router.post(
    '/',
    authorize('teacher', 'admin'),
    uploadWorksheetTemplate.fields([
        { name: 'templateImage', maxCount: 1 },
        { name: 'answerKeyImage', maxCount: 1 }
    ]),
    handleMulterError,
    createWorksheet
);

router.get('/', authorize('teacher', 'admin'), listWorksheets);
router.get('/:id', authorize('teacher', 'admin'), getWorksheet);
router.put('/:id', authorize('teacher', 'admin'), updateWorksheet);
router.delete('/:id', authorize('teacher', 'admin'), deleteWorksheet);

// ─── Answer Key ───────────────────────────────────────────────────────────────
router.post('/:id/extract-answer-key', authorize('teacher', 'admin'), extractAnswerKey);

// ─── Submissions ──────────────────────────────────────────────────────────────
router.post(
    '/:id/submissions',
    authorize('teacher', 'admin'),
    upload.single('image'),
    handleMulterError,
    addSubmission
);

router.post(
    '/:id/submissions/batch',
    authorize('teacher', 'admin'),
    upload.array('images', 30),
    handleMulterError,
    addBatchSubmissions
);

router.get('/:id/submissions', authorize('teacher', 'admin'), getSubmissions);

router.put(
    '/:id/submissions/:submissionId/assign',
    authorize('teacher', 'admin'),
    assignStudent
);

// ─── Processing ───────────────────────────────────────────────────────────────
router.post('/:id/submissions/:submissionId/process', authorize('teacher', 'admin'), processOneSubmission);
router.post('/:id/process-all', authorize('teacher', 'admin'), processAll);

// ─── Status & Publishing ──────────────────────────────────────────────────────
router.put('/:id/status', authorize('teacher', 'admin'), updateStatus);
router.post('/:id/publish', authorize('teacher', 'admin'), publishResults);

// ─── Gradebook ────────────────────────────────────────────────────────────────
router.post('/:id/gradebook/sync', authorize('teacher', 'admin'), syncToGradebook);
router.delete('/:id/gradebook/unlink', authorize('teacher', 'admin'), unlinkGradebook);

export default router;
