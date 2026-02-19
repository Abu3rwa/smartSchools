import express from 'express';
import {
    generateAdvancedReport,
    getReportTemplates,
    createReportTemplate,
    updateReportTemplate,
    deleteReportTemplate,
    getTokenUsage,
    getSchoolTokenUsage,
    getReportHistory,
    getEmailStatus,
    retryFailedEmails,
    testEmailConfiguration
} from '../controllers/advancedReportingController.js';
import { protect, authorize, authorizeWithPermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Advanced report generation
router.post('/generate-advanced', authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), generateAdvancedReport);

// Report templates
router.get('/templates', authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getReportTemplates);
router.post('/templates', authorize('teacher', 'admin'), createReportTemplate);
router.put('/templates/:id', authorize('teacher', 'admin'), updateReportTemplate);
router.delete('/templates/:id', authorize('teacher', 'admin'), deleteReportTemplate);

// Token usage analytics
router.get('/token-usage/:userId?', authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getTokenUsage);
router.get('/token-usage/school/:schoolId', authorizeWithPermission(
    ['admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getSchoolTokenUsage);

// Report history
router.get('/history', authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getReportHistory);

// Email management
router.get('/email-status/:reportId', authorizeWithPermission(
    ['teacher', 'admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getEmailStatus);
router.post('/retry-emails/:reportId', authorize('teacher', 'admin'), retryFailedEmails);

// Email configuration test (admin only)
router.get('/test-email', authorize('admin'), testEmailConfiguration);

export default router;
