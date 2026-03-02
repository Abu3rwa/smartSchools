import express from 'express';
import {
    getAllSubscriptions,
    getSubscriptionById,
    createSubscription,
    updateSubscription,
    cancelSubscription,
    getSubscriptionAnalytics,
    recordPayment,
    getBillingHistory,
    getSubscriptionPlans,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    toggleSubscriptionPlanStatus
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

// @route   GET /api/subscriptions/:id/invoices
router.get('/:id/invoices', getBillingHistory);

export default router;
