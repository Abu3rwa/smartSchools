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
    testEmailConfiguration,
    getReportProfiles,
    getEffectiveProfile,
    createReportProfile,
    updateReportProfile,
    deleteReportProfile,
    getReportDrafts,
    getReportDraft,
    updateReportDraft,
    approveReportDraft,
    reopenReportDraft,
    sendReportDraft,
    getDraftEmailPreview,
    cancelReportDraft
} from '../controllers/advancedReportingController.js';
import { protect, authorize, authorizeWithPermission } from '../middleware/auth.js';
import { emailSendRateLimiter } from '../middleware/rateLimiters.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Advanced report generation — generation spends AI credits and creates
// sendable drafts, so read-only report viewers must not reach it.
router.post('/generate-advanced', authorize('teacher', 'admin', 'super_admin'), generateAdvancedReport);

// Report templates
router.get('/templates', authorizeWithPermission(
    ['teacher', 'admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getReportTemplates);
router.post('/templates', authorize('teacher', 'admin', 'super_admin'), createReportTemplate);
router.put('/templates/:id', authorize('teacher', 'admin', 'super_admin'), updateReportTemplate);
router.delete('/templates/:id', authorize('teacher', 'admin', 'super_admin'), deleteReportTemplate);

// Token usage analytics
router.get('/token-usage/:userId?', authorizeWithPermission(
    ['teacher', 'admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getTokenUsage);
router.get('/token-usage/school/:schoolId', authorizeWithPermission(
    ['admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getSchoolTokenUsage);

// Report history
router.get('/history', authorizeWithPermission(
    ['teacher', 'admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getReportHistory);

// Email management
router.get('/email-status/:reportId', authorizeWithPermission(
    ['teacher', 'admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getEmailStatus);
router.post('/retry-emails/:reportId', authorize('teacher', 'admin', 'super_admin'), emailSendRateLimiter, retryFailedEmails);

// Email configuration test (admin only)
router.get('/test-email', authorize('admin', 'super_admin'), testEmailConfiguration);

// Report profiles
router.get('/profiles', authorizeWithPermission(
    ['teacher', 'admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getReportProfiles);
router.get('/profiles/effective', authorizeWithPermission(
    ['teacher', 'admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getEffectiveProfile);
router.post('/profiles', authorize('teacher', 'admin', 'super_admin'), createReportProfile);
router.put('/profiles/:id', authorize('teacher', 'admin', 'super_admin'), updateReportProfile);
router.delete('/profiles/:id', authorize('teacher', 'admin', 'super_admin'), deleteReportProfile);

// Report drafts (draft → approve → send workflow)
router.get('/drafts', authorizeWithPermission(
    ['teacher', 'admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getReportDrafts);
router.get('/drafts/:id', authorizeWithPermission(
    ['teacher', 'admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getReportDraft);
router.patch('/drafts/:id', authorize('teacher', 'admin', 'super_admin'), updateReportDraft);
router.post('/drafts/:id/approve', authorize('teacher', 'admin', 'super_admin'), approveReportDraft);
router.post('/drafts/:id/reopen', authorize('teacher', 'admin', 'super_admin'), reopenReportDraft);
router.get('/drafts/:id/email-preview', authorizeWithPermission(
    ['teacher', 'admin', 'super_admin', 'report_viewer'],
    [PERMISSIONS.VIEW_ALL_REPORTS]
), getDraftEmailPreview);
router.post('/drafts/:id/send', authorize('teacher', 'admin', 'super_admin'), emailSendRateLimiter, sendReportDraft);
router.delete('/drafts/:id', authorize('teacher', 'admin', 'super_admin'), cancelReportDraft);

export default router;
