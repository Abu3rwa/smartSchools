import express from 'express';
import {
    getAllSubscriptions,
    getSubscriptionById,
    createSubscription,
    updateSubscription,
    cancelSubscription,
    renewSubscription,
    getSubscriptionAnalytics,
    recordPayment,
    getBillingHistory,
    getSubscriptionPlans,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    toggleSubscriptionPlanStatus,
    getExpiringSubscriptions,
    notifySubscriptionRenewal,
    bulkExpireSubscriptions,
    getSubscriptionAuditLogs
} from '../controllers/subscriptionController.js';
import { protect } from '../middleware/auth.js';
import { superAdminOnly } from '../middleware/tenantIsolation.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(protect);
router.use(superAdminOnly);

// @route   GET /api/subscriptions
router.get('/', getAllSubscriptions);

// @route   GET /api/subscriptions/analytics
router.get('/analytics', getSubscriptionAnalytics);

// @route   GET /api/subscriptions/expiring
router.get('/expiring', getExpiringSubscriptions);

// @route   POST /api/subscriptions/bulk-expire
router.post('/bulk-expire', bulkExpireSubscriptions);

// @route   GET /api/subscriptions/plans
router.get('/plans', getSubscriptionPlans);

// @route   POST /api/subscriptions/plans
router.post('/plans', createSubscriptionPlan);

// @route   PUT /api/subscriptions/plans/:id
router.put('/plans/:id', updateSubscriptionPlan);

// @route   PATCH /api/subscriptions/plans/:id/status
router.patch('/plans/:id/status', toggleSubscriptionPlanStatus);

// @route   POST /api/subscriptions
router.post('/', createSubscription);

// @route   GET /api/subscriptions/:id
router.get('/:id', getSubscriptionById);

// @route   PUT /api/subscriptions/:id
router.put('/:id', updateSubscription);

// @route   DELETE /api/subscriptions/:id
router.delete('/:id', cancelSubscription);

// @route   POST /api/subscriptions/:id/payments  (record cash payment)
router.post('/:id/payments', recordPayment);

// @route   POST /api/subscriptions/:id/renew
router.post('/:id/renew', renewSubscription);

// @route   POST /api/subscriptions/:id/notify
router.post('/:id/notify', notifySubscriptionRenewal);

// @route   GET /api/subscriptions/:id/invoices
router.get('/:id/invoices', getBillingHistory);

// @route   GET /api/subscriptions/:id/audit
router.get('/:id/audit', getSubscriptionAuditLogs);

export default router;
