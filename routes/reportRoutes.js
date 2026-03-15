import express from 'express';
import { protect, authorizeWithPermission } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';
import { generateAIReport, generateAIReportByDateRange, generatePredefinedReport } from '../controllers/academicReportController.js';

const router = express.Router();

router.post('/generate-ai', protect, requireSchoolContext, authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS, PERMISSIONS.EDIT_REPORTS]
), requireFeature('academicIntelligence'), generateAIReport);
router.post('/generate-ai-range', protect, requireSchoolContext, authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS, PERMISSIONS.EDIT_REPORTS]
), requireFeature('academicIntelligence'), generateAIReportByDateRange);
router.post('/generate-predefined', protect, requireSchoolContext, authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS, PERMISSIONS.EDIT_REPORTS]
), generatePredefinedReport);

export default router;
