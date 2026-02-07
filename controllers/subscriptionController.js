import Subscription from '../models/Subscription.js';
import School from '../models/School.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import asyncHandler from 'express-async-handler';

// @desc    Get all subscriptions (super admin only)
// @route   GET /api/subscriptions
// @access  Private/Super Admin
export const getAllSubscriptions = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const plan = req.query.plan;
    const search = req.query.search;

    const query = {};
    if (status) query.status = status;
    if (plan) query.plan = plan;

    // Search by school name via populate match later, or notes
    let subscriptions;
    let total;

    if (search) {
        // Find schools matching search
        const matchingSchools = await School.find({
            name: { $regex: search, $options: 'i' }
        }).select('_id');
        const schoolIds = matchingSchools.map(s => s._id);
        query.$or = [
            { school: { $in: schoolIds } },
            { 'metadata.notes': { $regex: search, $options: 'i' } }
        ];
    }

    subscriptions = await Subscription.find(query)
        .populate('school', 'name contact.adminName contact.adminEmail')
        .populate('metadata.upgradedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);

    total = await Subscription.countDocuments(query);

    // Statistics
    const stats = await Subscription.aggregate([
        {
            $group: {
                _id: null,
                totalSubscriptions: { $sum: 1 },
                activeSubscriptions: {
                    $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                },
                trialSubscriptions: {
                    $sum: { $cond: [{ $eq: ['$status', 'trial'] }, 1, 0] }
                },
                totalRevenue: { $sum: '$billing.amount' },
                starterCount: {
                    $sum: { $cond: [{ $eq: ['$plan', 'starter'] }, 1, 0] }
                },
                professionalCount: {
                    $sum: { $cond: [{ $eq: ['$plan', 'professional'] }, 1, 0] }
                },
                enterpriseCount: {
                    $sum: { $cond: [{ $eq: ['$plan', 'enterprise'] }, 1, 0] }
                }
            }
        }
    ]);

    res.json({
        success: true,
        data: {
            subscriptions,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            statistics: stats[0] || {
                totalSubscriptions: 0,
                activeSubscriptions: 0,
                trialSubscriptions: 0,
                totalRevenue: 0,
                starterCount: 0,
                professionalCount: 0,
                enterpriseCount: 0
            }
        }
    });
});

// @desc    Get subscription by ID
// @route   GET /api/subscriptions/:id
// @access  Private/Super Admin
export const getSubscriptionById = asyncHandler(async (req, res) => {
    const subscription = await Subscription.findById(req.params.id)
        .populate('school')
        .populate('metadata.upgradedBy', 'firstName lastName email');

    if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    // Refresh usage data
    const [studentCount, teacherCount, classCount] = await Promise.all([
        Student.countDocuments({ school: subscription.school._id, status: 'active' }),
        User.countDocuments({ school: subscription.school._id, role: 'teacher' }),
        Class.countDocuments({ school: subscription.school._id })
    ]);

    subscription.usage.currentStudents = studentCount;
    subscription.usage.currentTeachers = teacherCount;
    subscription.usage.currentClasses = classCount;
    await subscription.save();

    res.json({ success: true, data: { subscription } });
});

// @desc    Create new subscription (cash payment)
// @route   POST /api/subscriptions
// @access  Private/Super Admin
export const createSubscription = asyncHandler(async (req, res) => {
    const { schoolId, plan = 'starter', status = 'trial', trialDays = 14, notes } = req.body;

    if (!schoolId) {
        return res.status(400).json({ success: false, message: 'School ID is required' });
    }

    const school = await School.findById(schoolId);
    if (!school) {
        return res.status(404).json({ success: false, message: 'School not found' });
    }

    const existing = await Subscription.findOne({ school: schoolId });
    if (existing) {
        return res.status(400).json({ success: false, message: 'Subscription already exists for this school' });
    }

    const planConfig = Subscription.getPlanConfig(plan);

    // Calculate trial end date
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await Subscription.create({
        school: schoolId,
        plan,
        status,
        paymentMethod: 'cash',
        trialEndsAt: status === 'trial' ? trialEndsAt : undefined,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        limits: planConfig.limits,
        features: planConfig.features,
        billing: {
            amount: planConfig.price,
            currency: planConfig.currency,
            interval: planConfig.interval,
            nextBillingAt: periodEnd
        },
        metadata: {
            source: 'manual',
            upgradedBy: req.user._id,
            notes: notes || `Subscription created by super admin (cash payment)`
        }
    });

    // Update school subscription reference
    school.subscription = {
        plan,
        status,
        startDate: now,
        endDate: periodEnd
    };
    await school.save();

    const populated = await Subscription.findById(subscription._id)
        .populate('school', 'name contact.adminName contact.adminEmail')
        .populate('metadata.upgradedBy', 'firstName lastName email');

    res.status(201).json({ success: true, data: { subscription: populated } });
});

// @desc    Update subscription (change plan, status, etc.)
// @route   PUT /api/subscriptions/:id
// @access  Private/Super Admin
export const updateSubscription = asyncHandler(async (req, res) => {
    const { plan, status, notes } = req.body;

    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    // Plan change
    if (plan && plan !== subscription.plan) {
        const planConfig = Subscription.getPlanConfig(plan);
        subscription.plan = plan;
        subscription.limits = planConfig.limits;
        subscription.features = planConfig.features;
        subscription.billing.amount = planConfig.price;
    }

    if (status) subscription.status = status;
    if (notes) subscription.metadata.notes = notes;
    subscription.metadata.upgradedBy = req.user._id;

    await subscription.save();

    // Sync to school
    const school = await School.findById(subscription.school);
    if (school) {
        school.subscription = {
            ...school.subscription,
            plan: subscription.plan,
            status: subscription.status
        };
        await school.save();
    }

    const updated = await Subscription.findById(subscription._id)
        .populate('school', 'name contact.adminName contact.adminEmail')
        .populate('metadata.upgradedBy', 'firstName lastName email');

    res.json({ success: true, data: { subscription: updated } });
});

// @desc    Cancel subscription
// @route   DELETE /api/subscriptions/:id
// @access  Private/Super Admin
export const cancelSubscription = asyncHandler(async (req, res) => {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    subscription.status = 'cancelled';
    subscription.metadata.upgradedBy = req.user._id;
    subscription.metadata.notes = `Cancelled by super admin on ${new Date().toLocaleDateString()}`;
    await subscription.save();

    // Sync to school
    const school = await School.findById(subscription.school);
    if (school) {
        school.subscription = { ...school.subscription, status: 'cancelled' };
        await school.save();
    }

    const updated = await Subscription.findById(subscription._id)
        .populate('school', 'name contact.adminName contact.adminEmail');

    res.json({ success: true, data: { subscription: updated } });
});

// @desc    Record a cash payment
// @route   POST /api/subscriptions/:id/payments
// @access  Private/Super Admin
export const recordPayment = asyncHandler(async (req, res) => {
    const { amount, notes, receiptNumber } = req.body;

    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    // Generate invoice number
    const invoiceCount = subscription.invoices.length + 1;
    const invoiceNumber = `INV-${subscription.school.toString().slice(-6).toUpperCase()}-${String(invoiceCount).padStart(4, '0')}`;

    const now = new Date();
    const nextBilling = new Date(now);
    nextBilling.setMonth(nextBilling.getMonth() + (subscription.billing.interval === 'year' ? 12 : 1));

    // Add invoice record
    subscription.invoices.push({
        stripeInvoiceId: receiptNumber || `CASH-${Date.now()}`,
        number: invoiceNumber,
        amount: amount || subscription.billing.amount,
        currency: subscription.billing.currency,
        status: 'paid',
        paidAt: now,
        createdAt: now
    });

    // Update billing dates
    subscription.billing.lastBilledAt = now;
    subscription.billing.nextBillingAt = nextBilling;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = nextBilling;

    // Activate if was trial or inactive
    if (subscription.status === 'trial' || subscription.status === 'inactive') {
        subscription.status = 'active';
    }

    subscription.metadata.notes = notes || `Cash payment of ${subscription.billing.currency} ${amount || subscription.billing.amount} recorded`;
    subscription.metadata.upgradedBy = req.user._id;

    await subscription.save();

    const updated = await Subscription.findById(subscription._id)
        .populate('school', 'name contact.adminName contact.adminEmail');

    res.json({ success: true, data: { subscription: updated } });
});

// @desc    Get subscription analytics
// @route   GET /api/subscriptions/analytics
// @access  Private/Super Admin
export const getSubscriptionAnalytics = asyncHandler(async (req, res) => {
    const { period = 'month' } = req.query;

    let startDate = new Date();
    switch (period) {
        case 'week': startDate.setDate(startDate.getDate() - 7); break;
        case 'month': startDate.setMonth(startDate.getMonth() - 1); break;
        case 'year': startDate.setFullYear(startDate.getFullYear() - 1); break;
        default: startDate.setMonth(startDate.getMonth() - 1);
    }

    const analytics = await Subscription.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                },
                newSubscriptions: { $sum: 1 },
                revenue: { $sum: '$billing.amount' },
                starterCount: { $sum: { $cond: [{ $eq: ['$plan', 'starter'] }, 1, 0] } },
                professionalCount: { $sum: { $cond: [{ $eq: ['$plan', 'professional'] }, 1, 0] } },
                enterpriseCount: { $sum: { $cond: [{ $eq: ['$plan', 'enterprise'] }, 1, 0] } }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const statusBreakdown = await Subscription.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const planDistribution = await Subscription.aggregate([
        { $group: { _id: '$plan', count: { $sum: 1 }, revenue: { $sum: '$billing.amount' } } }
    ]);

    const mrr = await Subscription.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, totalMRR: { $sum: '$billing.amount' } } }
    ]);

    // Total cash collected from invoices
    const totalCollected = await Subscription.aggregate([
        { $unwind: '$invoices' },
        { $match: { 'invoices.status': 'paid' } },
        { $group: { _id: null, total: { $sum: '$invoices.amount' } } }
    ]);

    res.json({
        success: true,
        data: {
            analytics,
            statusBreakdown,
            planDistribution,
            mrr: mrr[0]?.totalMRR || 0,
            totalCollected: totalCollected[0]?.total || 0,
            period
        }
    });
});

// @desc    Get billing history for subscription
// @route   GET /api/subscriptions/:id/invoices
// @access  Private/Super Admin
export const getBillingHistory = asyncHandler(async (req, res) => {
    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    // Sort invoices newest first
    const invoices = (subscription.invoices || []).sort((a, b) => b.createdAt - a.createdAt);

    res.json({ success: true, data: { invoices } });
});
