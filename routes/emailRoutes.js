import express from 'express';
import { sendTestEmail } from '../controllers/emailDeliveryController.js';
import { protect, authorize } from '../middleware/auth.js';
import { emailSendRateLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// Test email sending - admin only, uses your Gmail to send to yourself
router.post('/test', protect, authorize('admin'), emailSendRateLimiter, sendTestEmail);

export default router;
