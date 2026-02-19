import express from 'express';
import { protect, authorizeWithPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { generateAIReport, generateAIReportByDateRange, generatePredefinedReport } from '../controllers/academicReportController.js';

const router = express.Router();

router.post('/generate-ai', protect, authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS, PERMISSIONS.EDIT_REPORTS]
), generateAIReport);
router.post('/generate-ai-range', protect, authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS, PERMISSIONS.EDIT_REPORTS]
), generateAIReportByDateRange);
router.post('/generate-predefined', protect, authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS, PERMISSIONS.EDIT_REPORTS]
), generatePredefinedReport);

export default router;
