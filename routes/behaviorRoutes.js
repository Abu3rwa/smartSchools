import express from 'express';
import {
    getBehaviorAnalytics,
    getUserBehavior,
    getSecurityEvents,
    getUsageStatistics,
    exportBehaviorData,
    cleanupBehaviorData,
    trackBehaviorEvent,
    listBehaviorEvents,
    startBehaviorSession,
    heartbeatSession,
    endSession,
    getActiveBehaviorSessions,
    getBehaviorDashboard,
    getBehaviorLiveSnapshot
} from '../controllers/behaviorController.js';
import { protect, authorize } from '../middleware/auth.js';
import { superAdminOnly } from '../middleware/tenantIsolation.js';
import { validate } from '../middleware/validator.js';
import { behaviorValidationRules } from '../validators/behaviorValidators.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);

router.post('/events', behaviorValidationRules.trackEvent, validate, trackBehaviorEvent);
router.get('/events', authorize('admin', 'department_principal', 'super_admin'), behaviorValidationRules.listEvents, validate, listBehaviorEvents);

router.post('/sessions/start', behaviorValidationRules.sessionStart, validate, startBehaviorSession);
router.patch('/sessions/:sessionId/heartbeat', behaviorValidationRules.sessionIdParam, validate, heartbeatSession);
router.post('/sessions/:sessionId/end', behaviorValidationRules.sessionIdParam, validate, endSession);
router.get('/sessions/active', authorize('admin', 'department_principal', 'super_admin'), getActiveBehaviorSessions);

router.get('/dashboard', authorize('admin', 'department_principal', 'super_admin'), behaviorValidationRules.dashboardQuery, validate, getBehaviorDashboard);
router.get('/live', authorize('admin', 'department_principal', 'super_admin'), getBehaviorLiveSnapshot);

// @route   GET /api/behavior/analytics
// @desc    Get behavior analytics dashboard
// @access  Private/Super Admin
router.get('/analytics', authorize('admin', 'super_admin'), getBehaviorAnalytics);

// @route   GET /api/behavior/users/:userId
// @desc    Get user behavior details
// @access  Private/Super Admin or School Admin
router.get('/users/:userId', authorize('admin', 'super_admin'), getUserBehavior);

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
router.delete('/cleanup', authorize('admin', 'super_admin'), cleanupBehaviorData);

export default router;
