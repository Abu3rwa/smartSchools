import express from 'express';
import {
    sendGradeUpdateNotification,
    sendDailyReport,
    sendDailyClassworkUpdate,
    sendGradebookSummaryUpdate,
    sendMonthlyReport,
    getNotificationHistory,
    getNotification,
    resendNotification,
    sendAIReport,
    markNotificationAsRead
} from '../controllers/notificationController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);
router.use(requireSchoolContext);

// Send notifications
router.post('/grade-update', authorize('teacher', 'admin'), sendGradeUpdateNotification);
router.post('/daily-report/:studentId', authorize('teacher', 'admin'), sendDailyReport);
router.post('/daily-classwork/:studentId', authorize('teacher', 'admin'), sendDailyClassworkUpdate);
router.post('/gradebook-summary/:studentId', authorize('teacher', 'admin'), sendGradebookSummaryUpdate);
router.post('/monthly-report/:studentId', authorize('teacher', 'admin'), sendMonthlyReport);
router.post('/send-ai-report/:studentId', authorize('teacher', 'admin'), requireFeature('academicIntelligence'), sendAIReport);


// Get notifications
router.get('/', getNotificationHistory);
router.get('/:id', validationRules.mongoId, validate, getNotification);
router.patch('/:id/read', validationRules.mongoId, validate, markNotificationAsRead);

// Resend
router.post('/:id/resend', authorize('teacher', 'admin'), validationRules.mongoId, validate, resendNotification);

export default router;
