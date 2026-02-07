import express from 'express';
import {
    register,
    login,
    getMe,
    updateProfile,
    changePassword,
    logout,
    getGoogleAuthUrl,
    googleCallback,
    sendTestEmail
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// Public routes
router.post('/register', validationRules.register, validate, register);
router.post('/login', validationRules.login, validate, login);

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
