import express from 'express';
import {
    sendGradeUpdateNotification,
    sendDailyReport,
    sendDailyClassworkUpdate,
    sendMonthlyReport,
    getNotificationHistory,
    getNotification,
    resendNotification,
    sendAIReport
} from '../controllers/notificationController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Send notifications
router.post('/grade-update', authorize('teacher', 'admin'), sendGradeUpdateNotification);
router.post('/daily-report/:studentId', authorize('teacher', 'admin'), sendDailyReport);
router.post('/daily-classwork/:studentId', authorize('teacher', 'admin'), sendDailyClassworkUpdate);
router.post('/monthly-report/:studentId', authorize('teacher', 'admin'), sendMonthlyReport);
router.post('/send-ai-report/:studentId', authorize('teacher', 'admin'), sendAIReport);


// Get notifications
router.get('/', getNotificationHistory);
router.get('/:id', validationRules.mongoId, validate, getNotification);

// Resend
router.post('/:id/resend', authorize('teacher', 'admin'), validationRules.mongoId, validate, resendNotification);

export default router;
