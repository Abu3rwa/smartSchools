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
} from '../controllers/advancedReportController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Advanced report generation
router.post('/generate-advanced', generateAdvancedReport);

// Report templates
router.get('/templates', getReportTemplates);
router.post('/templates', authorize('teacher', 'admin'), createReportTemplate);
router.put('/templates/:id', authorize('teacher', 'admin'), updateReportTemplate);
router.delete('/templates/:id', authorize('teacher', 'admin'), deleteReportTemplate);

// Token usage analytics
router.get('/token-usage/:userId?', getTokenUsage);
router.get('/token-usage/school/:schoolId', authorize('admin', 'super_admin'), getSchoolTokenUsage);

// Report history
router.get('/history', getReportHistory);

// Email management
router.get('/email-status/:reportId', getEmailStatus);
router.post('/retry-emails/:reportId', retryFailedEmails);

// Email configuration test (admin only)
router.get('/test-email', authorize('admin'), testEmailConfiguration);

export default router;
