import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    getScales,
    createScale,
    updateScale,
    deleteScale,
    setDefaultScale
} from '../controllers/sbrConfigController.js';
import {
    generateSBR,
    generateBulkSBR,
    previewSBR,
    getReportCards,
    getReportCard,
    downloadReportCardPdf,
    publishReportCard,
    emailReportCard,
    deleteReportCard
} from '../controllers/sbrController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// Scale config routes (admin only)
router.get('/scales', authorize('admin'), getScales);
router.post('/scales', authorize('admin'), createScale);
router.put('/scales/:id', authorize('admin'), updateScale);
router.delete('/scales/:id', authorize('admin'), deleteScale);
router.post('/scales/:id/default', authorize('admin'), setDefaultScale);

// Generation routes (teacher + admin)
router.post('/generate', authorize('admin', 'teacher'), generateSBR);
router.post('/generate-bulk', authorize('admin', 'teacher'), generateBulkSBR);
router.get('/preview/:studentId', authorize('admin', 'teacher'), previewSBR);

// Report access routes
router.get('/reports', authorize('admin', 'teacher', 'parent'), getReportCards);
router.get('/reports/:id', authorize('admin', 'teacher', 'parent'), getReportCard);
router.get('/reports/:id/pdf', authorize('admin', 'teacher', 'parent'), downloadReportCardPdf);
router.post('/reports/:id/publish', authorize('admin', 'teacher'), publishReportCard);
router.post('/reports/:id/email', authorize('admin', 'teacher'), emailReportCard);
router.delete('/reports/:id', authorize('admin', 'teacher'), deleteReportCard);

export default router;
