import express from 'express';
import rateLimit from 'express-rate-limit';
import {
    register,
    login,
    getMe,
    updateProfile,
    changePassword,
    logout,
    getGoogleAuthUrl,
    googleCallback,
    sendTestEmail,
    forgotPassword,
    resetPassword,
    impersonateUser
} from '../controllers/authController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// Rate limiter for password reset endpoints
const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: {
        success: false,
        message: 'Too many password reset attempts, please try again later'
    }
});

// Public routes
router.post('/register', validationRules.register, validate, register);
router.post('/login', validationRules.login, validate, login);

// Password reset routes (public) with rate limiting
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);

// Super Admin Impersonation
router.post('/impersonate', protect, authorize('super_admin'), impersonateUser);

// Google OAuth routes (login/register with Gmail tokens)
router.get('/google/url', getGoogleAuthUrl);
router.get('/google/callback', googleCallback);

// Protected routes
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/password', protect, changePassword);
router.post('/logout', protect, logout);

// Test email sending
router.post('/test-email', protect, sendTestEmail);

export default router;
