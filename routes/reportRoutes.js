import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { generateAIReport, generateAIReportByDateRange, generatePredefinedReport } from '../controllers/reportController.js';

const router = express.Router();

router.post('/generate-ai', protect, authorize('teacher', 'admin'), generateAIReport);
router.post('/generate-ai-range', protect, authorize('teacher', 'admin'), generateAIReportByDateRange);
router.post('/generate-predefined', protect, authorize('teacher', 'admin'), generatePredefinedReport);

export default router;
