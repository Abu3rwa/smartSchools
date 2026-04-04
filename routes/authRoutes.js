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
    refresh,
    impersonateUser,
    switchRole
} from '../controllers/authenticationController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';
import upload from '../middleware/upload.js';
import { validateRequestSchema } from '../middleware/schemaValidator.js';
import { forgotPasswordBodySchema, resetPasswordBodySchema, changePasswordBodySchema } from '../schemas/authSchemas.js';

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

// School-scoped user creation (admin only)
router.post('/register', protect, requireSchoolContext, authorize('admin'), validationRules.register, validate, register);
router.post('/login', validationRules.login, validate, login);
router.post('/refresh', refresh);

// Password reset routes (public) with rate limiting
router.post('/forgot-password', passwordResetLimiter, validateRequestSchema({ bodySchema: forgotPasswordBodySchema }), forgotPassword);
router.post('/reset-password', passwordResetLimiter, validateRequestSchema({ bodySchema: resetPasswordBodySchema }), resetPassword);

// Super Admin Impersonation
router.post('/impersonate', protect, authorize('super_admin', 'admin'), impersonateUser);

// Role switching (multi-role users)
router.post('/switch-role', protect, switchRole);

// Google OAuth routes (login/register with Gmail tokens)
router.get('/google/url', getGoogleAuthUrl);
router.get('/google/callback', googleCallback);

// Protected routes
router.get('/me', protect, getMe);
router.put('/profile', protect, upload.single('avatar'), updateProfile);
router.put('/password', protect, validateRequestSchema({ bodySchema: changePasswordBodySchema }), changePassword);
router.post('/logout', protect, logout);

// Test email sending
router.post('/test-email', protect, sendTestEmail);

export default router;
