import express from 'express';
import { sendTestEmail } from '../controllers/emailDeliveryController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Test email sending - uses your Gmail to send to yourself
router.post('/test', protect, sendTestEmail);

export default router;
