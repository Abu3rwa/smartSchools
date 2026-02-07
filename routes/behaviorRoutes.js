import express from 'express';
import asyncHandler from 'express-async-handler';
import {
    getBehaviorAnalytics,
    getUserBehavior,
    getSecurityEvents,
    getUsageStatistics,
    exportBehaviorData,
    cleanupBehaviorData
} from '../controllers/behaviorController.js';
import { protect } from '../middleware/auth.js';
import { superAdminOnly } from '../middleware/tenantIsolation.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

// @route   GET /api/behavior/analytics
// @desc    Get behavior analytics dashboard
// @access  Private/Super Admin
router.get('/analytics', superAdminOnly, getBehaviorAnalytics);

// @route   GET /api/behavior/users/:userId
// @desc    Get user behavior details
// @access  Private/Super Admin or School Admin
router.get('/users/:userId', getUserBehavior);

// @route   GET /api/behavior/security
// @desc    Get security events
// @access  Private/Super Admin
router.get('/security', superAdminOnly, getSecurityEvents);

// @route   GET /api/behavior/usage
// @desc    Get system usage statistics
// @access  Private/Super Admin
router.get('/usage', superAdminOnly, getUsageStatistics);

// @route   GET /api/behavior/export
// @desc    Export behavior data
// @access  Private/Super Admin
router.get('/export', superAdminOnly, exportBehaviorData);

// @route   DELETE /api/behavior/cleanup
// @desc    Clean up old behavior data
// @access  Private/Super Admin
router.delete('/cleanup', superAdminOnly, cleanupBehaviorData);

export default router;
