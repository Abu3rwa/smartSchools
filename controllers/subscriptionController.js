import Subscription from '../models/Subscription.js';
import SubscriptionPlan from '../models/SubscriptionPlan.js';
import School from '../models/School.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Notification from '../models/Notification.js';
import SubscriptionAuditLog from '../models/SubscriptionAuditLog.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js';
import { sendSubscriptionEventEmail } from '../services/subscriptionEmailService.js';
import {
    coerceFeatureFlags,
    DEFAULT_PLAN_CONFIGS,
    FEATURE_KEYS,
    FEATURES,
    getDefaultPlanConfig,
    getPlanName,
    isRecognizedPlan,
    normalizePlan,
    toSchoolPlan
} from '../constants/features.js';

const toPlainObject = (value) => {
    if (!value) return {};
    return typeof value.toObject === 'function' ? value.toObject() : value;
};
const ALLOWED_BILLING_INTERVALS = new Set(['month', 'year']);

const normalizeFeaturePayload = (rawFeatures = {}) => {
    const input = rawFeatures && typeof rawFeatures === 'object' && !Array.isArray(rawFeatures)
        ? rawFeatures
        : {};

    const defaults = FEATURE_KEYS.reduce((acc, featureKey) => {
        acc[featureKey] = false;
        return acc;
    }, {});

    return {
        ...defaults,
        ...coerceFeatureFlags(input)
    };
};

const createPlanSeedPayload = (planKey, userId = null) => {
    const defaults = getDefaultPlanConfig(planKey);
    if (!defaults) return null;

    return {
        key: defaults.key,
        name: defaults.name,
        description: defaults.description || '',
        limits: defaults.limits,
        features: normalizeFeaturePayload(defaults.features),
        billing: {
            amount: defaults.billing.amount,
            currency: defaults.billing.currency,
            interval: defaults.billing.interval
        },
        isActive: true,
        sortOrder: ['starter', 'professional', 'enterprise'].indexOf(defaults.key),
        metadata: {
            source: 'system_default',
            createdBy: userId || undefined,
            updatedBy: userId || undefined
        }
    };
};

const ensureDefaultPlansExist = async (userId = null) => {
    const defaultPlanKeys = Object.keys(DEFAULT_PLAN_CONFIGS);
    const existingPlans = await SubscriptionPlan.find({ key: { $in: defaultPlanKeys } })
        .select('key')
        .setOptions({ skipTenantFilter: true })
        .lean();

    const existingKeys = new Set(existingPlans.map((plan) => plan.key));
    const missingKeys = defaultPlanKeys.filter((key) => !existingKeys.has(key));
    if (missingKeys.length === 0) return;

    const payload = missingKeys
        .map((key) => createPlanSeedPayload(key, userId))
        .filter(Boolean);

    if (payload.length > 0) {
        try {
            await SubscriptionPlan.insertMany(payload, { ordered: false });
        } catch (error) {
            if (error?.code !== 11000) {
                throw error;
            }
        }
    }
};

const serializePlan = (planDoc) => {
    const plan = toPlainObject(planDoc);
    const normalizedKey = normalizePlan(plan.key);

    return {
        _id: plan._id,
        key: normalizedKey,
        name: plan.name || getPlanName(normalizedKey),
        description: plan.description || '',
        limits: plan.limits || {},
        features: normalizeFeaturePayload(plan.features),
        billing: {
            amount: plan.billing?.amount ?? 0,
            currency: plan.billing?.currency || 'USD',
            interval: plan.billing?.interval || 'month'
        },
        isActive: plan.isActive !== false,
        sortOrder: Number.isFinite(plan.sortOrder) ? plan.sortOrder : 0,
        source: plan.metadata?.source || 'manual'
    };
};

export const syncSchoolSubscriptionState = async ({ schoolId, plan, status, features }) => {
    const school = await School.findById(schoolId);
    if (!school) return;

    school.subscription = {
        ...toPlainObject(school.subscription),
        plan: toSchoolPlan(plan),
        status
    };

    if (features) {
        school.settings = {
            ...toPlainObject(school.settings),
            features: {
                ...toPlainObject(school.settings?.features),
                ...coerceFeatureFlags(features)
            }
        };
    }

    await school.save();
};

const collectSchoolAdmins = async (schoolId) => {
    return User.find({ school: schoolId, role: 'admin', isActive: true })
        .select('_id email firstName lastName')
        .setOptions({ skipTenantFilter: true })
        .lean();
};

const createSubscriptionReminderNotifications = async ({
    school,
    subscription,
    admins,
    subject,
    message,
    daysRemaining,
    type = NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING
}) => {
    const metadata = {
        subscriptionId: String(subscription._id),
        planName: subscription.plan,
        expiresAt: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toISOString() : null,
        daysRemaining,
        billingInterval: subscription.billing?.interval === 'year' ? 'annually' : 'monthly'
    };

    const payload = admins
        .filter((admin) => admin.email)
        .map((admin) => ({
            school: school._id,
            recipient: admin._id,
            recipientEmail: admin.email,
            type,
            subject,
            message,
            channels: ['email', 'push'],
            status: 'pending',
            priority: daysRemaining <= 1 ? 'high' : 'normal',
            metadata
        }));

    if (payload.length > 0) {
        await Notification.insertMany(payload, { ordered: false });
    }

    await Promise.allSettled(
        admins.map((admin) => sendSubscriptionEventEmail({
            eventType: type,
            recipientEmail: admin.email,
            schoolId: school._id,
            schoolName: school.name,
            planName: subscription.plan,
            billingInterval: subscription.billing?.interval === 'year' ? 'annually' : 'monthly',
            expiresAt: subscription.currentPeriodEnd,
            nextBillingDate: subscription.billing?.nextBillingAt || subscription.currentPeriodEnd,
            daysRemaining,
            preferredUserId: admin._id
        }))
    );

    return payload.length;
};

const addMonths = (dateValue, monthsToAdd) => {
    const date = new Date(dateValue);
    date.setMonth(date.getMonth() + monthsToAdd);
    return date;
};

const createInvoiceNumber = (schoolId, invoiceCount) => {
    return `INV-${schoolId.toString().slice(-6).toUpperCase()}-${String(invoiceCount).padStart(4, '0')}`;
};

const createSubscriptionRenewedNotifications = async ({
    school,
    subscription,
    admins,
    nextBillingDate
}) => {
    const metadata = {
        subscriptionId: String(subscription._id),
        planName: subscription.plan,
        expiresAt: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toISOString() : null,
        billingInterval: subscription.billing?.interval === 'year' ? 'annually' : 'monthly'
    };

    const payload = admins
        .filter((admin) => admin.email)
        .map((admin) => ({
            school: school._id,
            recipient: admin._id,
            recipientEmail: admin.email,
            type: NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED,
            subject: 'Subscription renewed successfully',
            message: 'Your school subscription has been renewed and remains active.',
            channels: ['email', 'push'],
            status: 'pending',
            priority: 'normal',
            metadata
        }));

    if (payload.length > 0) {
        await Notification.insertMany(payload, { ordered: false });
    }

    await Promise.allSettled(
        admins.map((admin) => sendSubscriptionEventEmail({
            eventType: NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED,
            recipientEmail: admin.email,
            schoolId: school._id,
            schoolName: school.name,
            planName: subscription.plan,
            billingInterval: subscription.billing?.interval === 'year' ? 'annually' : 'monthly',
            expiresAt: subscription.currentPeriodEnd,
            nextBillingDate,
            preferredUserId: admin._id
        }))
    );

    return payload.length;
};

const writeSubscriptionAuditLog = async ({
    schoolId,
    subscriptionId,
    performedBy,
    action,
    details
}) => {
    return SubscriptionAuditLog.create({
        school: schoolId,
        subscription: subscriptionId,
        performedBy,
        action,
        details
    });
};

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
    if (plan && isRecognizedPlan(plan)) {
        query.plan = normalizePlan(plan);
    }

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

    const dynamicPlanDistribution = await Subscription.aggregate([
        {
            $group: {
                _id: '$plan',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1, _id: 1 } }
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
            },
            planDistribution: dynamicPlanDistribution.map((entry) => ({
                key: entry._id,
                count: entry.count
            }))
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
    const normalizedPlan = normalizePlan(plan);

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

    const planConfig = await Subscription.getPlanConfig(normalizedPlan);
    if (!planConfig) {
        return res.status(400).json({
            success: false,
            message: `Plan "${normalizedPlan}" does not exist`
        });
    }
    if (planConfig.isActive === false) {
        return res.status(400).json({
            success: false,
            message: `Plan "${normalizedPlan}" is inactive and cannot be assigned`
        });
    }

    // Calculate trial end date
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await Subscription.create({
        school: schoolId,
        plan: normalizedPlan,
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

    await syncSchoolSubscriptionState({
        schoolId,
        plan: normalizedPlan,
        status,
        features: planConfig.features
    });

    const populated = await Subscription.findById(subscription._id)
        .populate('school', 'name contact.adminName contact.adminEmail')
        .populate('metadata.upgradedBy', 'firstName lastName email');

    res.status(201).json({ success: true, data: { subscription: populated } });
});

// @desc    Update subscription (change plan, status, etc.)
// @route   PUT /api/subscriptions/:id
// @access  Private/Super Admin
export const updateSubscription = asyncHandler(async (req, res) => {
    const { plan, status, notes, features } = req.body;

    const subscription = await Subscription.findById(req.params.id);
    if (!subscription) {
        return res.status(404).json({ success: false, message: 'Subscription not found' });
    }

    // Plan change
    if (plan && isRecognizedPlan(plan) && normalizePlan(plan) !== subscription.plan) {
        const nextPlan = normalizePlan(plan);
        const planConfig = await Subscription.getPlanConfig(nextPlan);
        if (!planConfig) {
            return res.status(400).json({
                success: false,
                message: `Plan "${nextPlan}" does not exist`
            });
        }
        if (planConfig.isActive === false) {
            return res.status(400).json({
                success: false,
                message: `Plan "${nextPlan}" is inactive and cannot be assigned`
            });
        }
        subscription.plan = nextPlan;
        subscription.limits = planConfig.limits;
        subscription.features = planConfig.features;
        subscription.billing.amount = planConfig.price;
    }

    if (features && typeof features === 'object' && !Array.isArray(features)) {
        const sanitizedFeatureOverrides = coerceFeatureFlags(features);
        subscription.features = {
            ...toPlainObject(subscription.features),
            ...sanitizedFeatureOverrides
        };
    }

    if (status) subscription.status = status;
    if (notes) subscription.metadata.notes = notes;
    subscription.metadata.upgradedBy = req.user._id;

    await subscription.save();

    await syncSchoolSubscriptionState({
        schoolId: subscription.school,
        plan: subscription.plan,
        status: subscription.status,
        features: subscription.features
    });

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

    await syncSchoolSubscriptionState({
        schoolId: subscription.school,
        plan: subscription.plan,
        status: 'cancelled',
        features: subscription.features
    });

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

// @desc    Renew subscription period and reactivate school access
// @route   POST /api/subscriptions/:id/renew
// @access  Private/Super Admin
export const renewSubscription = asyncHandler(async (req, res) => {
    const {
        cycles = 1,
        amount,
        notes,
        resetCancelAtPeriodEnd = true
    } = req.body || {};

    const normalizedCycles = Number.parseInt(cycles, 10);
    if (!Number.isFinite(normalizedCycles) || normalizedCycles < 1 || normalizedCycles > 24) {
        return res.status(400).json({
            success: false,
            message: 'cycles must be an integer between 1 and 24'
        });
    }

    const subscription = await Subscription.findById(req.params.id)
        .populate('school', 'name contact.adminName contact.adminEmail');

    if (!subscription) {
        return res.status(404).json({
            success: false,
            message: 'Subscription not found'
        });
    }

    const now = new Date();
    const previousStatus = subscription.status;
    const previousPeriodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
    const monthsPerCycle = subscription.billing?.interval === 'year' ? 12 : 1;
    const currentPeriodEnd = subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : null;
    const renewalAnchor = currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()
        ? currentPeriodEnd
        : now;
    const nextBillingDate = addMonths(renewalAnchor, monthsPerCycle * normalizedCycles);

    const invoiceAmount = Number.isFinite(Number(amount))
        ? Number(amount)
        : (Number(subscription.billing?.amount) || 0) * normalizedCycles;

    const invoiceCount = subscription.invoices.length + 1;
    const invoiceNumber = createInvoiceNumber(subscription.school?._id || subscription.school, invoiceCount);

    subscription.invoices.push({
        stripeInvoiceId: `MANUAL-RENEW-${Date.now()}`,
        number: invoiceNumber,
        amount: invoiceAmount,
        currency: subscription.billing?.currency || 'USD',
        status: 'paid',
        paidAt: now,
        createdAt: now
    });

    subscription.currentPeriodStart = renewalAnchor;
    subscription.currentPeriodEnd = nextBillingDate;
    subscription.billing.lastBilledAt = now;
    subscription.billing.nextBillingAt = nextBillingDate;
    subscription.status = 'active';
    subscription.trialEndsAt = undefined;
    if (resetCancelAtPeriodEnd) {
        subscription.cancelAtPeriodEnd = false;
    }
    subscription.metadata = {
        ...toPlainObject(subscription.metadata),
        upgradedBy: req.user?._id,
        notes: notes || `Subscription renewed for ${normalizedCycles} billing cycle(s) on ${now.toISOString()}`
    };

    await subscription.save();

    await writeSubscriptionAuditLog({
        schoolId: subscription.school?._id || subscription.school,
        subscriptionId: subscription._id,
        performedBy: req.user?._id,
        action: 'manual_renewal',
        details: {
            cycles: normalizedCycles,
            amount: invoiceAmount,
            currency: subscription.billing?.currency || 'USD',
            previousStatus,
            renewedStatus: subscription.status,
            previousPeriodEnd,
            renewedUntil: nextBillingDate,
            note: notes || ''
        }
    });

    await syncSchoolSubscriptionState({
        schoolId: subscription.school?._id || subscription.school,
        plan: subscription.plan,
        status: subscription.status,
        features: subscription.features
    });

    const admins = await collectSchoolAdmins(subscription.school?._id || subscription.school);
    const notifications = await createSubscriptionRenewedNotifications({
        school: subscription.school,
        subscription,
        admins,
        nextBillingDate
    });

    const updated = await Subscription.findById(subscription._id)
        .populate('school', 'name contact.adminName contact.adminEmail')
        .populate('metadata.upgradedBy', 'firstName lastName email');

    res.json({
        success: true,
        message: 'Subscription renewed successfully',
        data: {
            subscription: updated,
            notifications,
            renewedUntil: nextBillingDate
        }
    });
});

// @desc    Get subscription audit logs
// @route   GET /api/subscriptions/:id/audit
// @access  Private/Super Admin
export const getSubscriptionAuditLogs = asyncHandler(async (req, res) => {
    const subscription = await Subscription.findById(req.params.id)
        .select('_id school')
        .setOptions({ skipTenantFilter: true })
        .lean();

    if (!subscription) {
        return res.status(404).json({
            success: false,
            message: 'Subscription not found'
        });
    }

    const logs = await SubscriptionAuditLog.find({ subscription: subscription._id })
        .populate('performedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(100)
        .setOptions({ skipTenantFilter: true })
        .lean();

    res.json({
        success: true,
        data: {
            logs
        }
    });
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

// @desc    Get all subscription plans
// @route   GET /api/subscriptions/plans
// @access  Private/Super Admin
export const getSubscriptionPlans = asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    await ensureDefaultPlansExist(req.user?._id);

    const query = includeInactive ? {} : { isActive: true };
    const plans = await SubscriptionPlan.find(query)
        .sort({ sortOrder: 1, createdAt: 1 })
        .setOptions({ skipTenantFilter: true });
    const planUsage = await Subscription.aggregate([
        {
            $group: {
                _id: '$plan',
                count: { $sum: 1 }
            }
        }
    ]);
    const usageByKey = new Map(
        planUsage
            .filter((entry) => typeof entry._id === 'string' && entry._id.trim().length > 0)
            .map((entry) => [normalizePlan(entry._id), entry.count])
    );

    res.json({
        success: true,
        data: {
            plans: plans.map((planDoc) => {
                const serialized = serializePlan(planDoc);
                return {
                    ...serialized,
                    subscriptionCount: usageByKey.get(serialized.key) || 0
                };
            }),
            featureDefinitions: FEATURES
        }
    });
});

// @desc    Create a subscription plan
// @route   POST /api/subscriptions/plans
// @access  Private/Super Admin
export const createSubscriptionPlan = asyncHandler(async (req, res) => {
    const { key, name, description, limits, billing, features, isActive = true, sortOrder } = req.body || {};
    const rawKey = String(key || '').trim();
    if (rawKey.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Plan key is required'
        });
    }
    const normalizedKey = normalizePlan(rawKey);

    if (!isRecognizedPlan(normalizedKey)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid plan key'
        });
    }

    if (!name || String(name).trim().length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Plan name is required'
        });
    }

    const existing = await SubscriptionPlan.findOne({ key: normalizedKey }).setOptions({ skipTenantFilter: true });
    if (existing) {
        return res.status(400).json({
            success: false,
            message: `Plan "${normalizedKey}" already exists`
        });
    }

    const defaultConfig = getDefaultPlanConfig(normalizedKey) || getDefaultPlanConfig('starter');
    const resolvedLimits = {
        maxStudents: Number.isFinite(Number(limits?.maxStudents)) ? Number(limits.maxStudents) : defaultConfig.limits.maxStudents,
        maxTeachers: Number.isFinite(Number(limits?.maxTeachers)) ? Number(limits.maxTeachers) : defaultConfig.limits.maxTeachers,
        maxClasses: Number.isFinite(Number(limits?.maxClasses)) ? Number(limits.maxClasses) : defaultConfig.limits.maxClasses,
        maxStorage: Number.isFinite(Number(limits?.maxStorage)) ? Number(limits.maxStorage) : defaultConfig.limits.maxStorage
    };

    const resolvedBilling = {
        amount: Number.isFinite(Number(billing?.amount)) ? Number(billing.amount) : defaultConfig.billing.amount,
        currency: String(billing?.currency || defaultConfig.billing.currency || 'USD').trim().toUpperCase(),
        interval: ALLOWED_BILLING_INTERVALS.has(billing?.interval)
            ? billing.interval
            : defaultConfig.billing.interval
    };

    const plan = await SubscriptionPlan.create({
        key: normalizedKey,
        name: String(name).trim(),
        description: description || '',
        limits: resolvedLimits,
        billing: resolvedBilling,
        features: normalizeFeaturePayload(features ?? defaultConfig.features),
        isActive: Boolean(isActive),
        sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        metadata: {
            source: 'manual',
            createdBy: req.user?._id,
            updatedBy: req.user?._id
        }
    });

    res.status(201).json({
        success: true,
        message: 'Subscription plan created successfully',
        data: { plan: serializePlan(plan) }
    });
});

// @desc    Update a subscription plan
// @route   PUT /api/subscriptions/plans/:id
// @access  Private/Super Admin
export const updateSubscriptionPlan = asyncHandler(async (req, res) => {
    const plan = await SubscriptionPlan.findById(req.params.id).setOptions({ skipTenantFilter: true });
    if (!plan) {
        return res.status(404).json({
            success: false,
            message: 'Plan not found'
        });
    }

    const {
        key,
        name,
        description,
        limits,
        billing,
        features,
        isActive,
        sortOrder
    } = req.body || {};

    const previousPlanKey = plan.key;
    if (key !== undefined) {
        const normalizedKey = normalizePlan(key);
        if (!isRecognizedPlan(normalizedKey)) {
            return res.status(400).json({ success: false, message: 'Invalid plan key' });
        }

        if (normalizedKey !== plan.key) {
            const existing = await SubscriptionPlan.findOne({ key: normalizedKey }).setOptions({ skipTenantFilter: true });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `Plan "${normalizedKey}" already exists`
                });
            }

            plan.key = normalizedKey;
        }
    }

    if (name !== undefined) plan.name = String(name).trim();
    if (description !== undefined) plan.description = description || '';

    if (limits && typeof limits === 'object') {
        plan.limits = {
            ...toPlainObject(plan.limits),
            maxStudents: Number.isFinite(Number(limits.maxStudents)) ? Number(limits.maxStudents) : plan.limits.maxStudents,
            maxTeachers: Number.isFinite(Number(limits.maxTeachers)) ? Number(limits.maxTeachers) : plan.limits.maxTeachers,
            maxClasses: Number.isFinite(Number(limits.maxClasses)) ? Number(limits.maxClasses) : plan.limits.maxClasses,
            maxStorage: Number.isFinite(Number(limits.maxStorage)) ? Number(limits.maxStorage) : plan.limits.maxStorage
        };
    }

    if (billing && typeof billing === 'object') {
        plan.billing = {
            ...toPlainObject(plan.billing),
            amount: Number.isFinite(Number(billing.amount)) ? Number(billing.amount) : plan.billing.amount,
            currency: String(billing.currency || plan.billing.currency || 'USD').trim().toUpperCase(),
            interval: ALLOWED_BILLING_INTERVALS.has(billing.interval) ? billing.interval : plan.billing.interval
        };
    }

    if (features && typeof features === 'object' && !Array.isArray(features)) {
        plan.features = normalizeFeaturePayload({
            ...toPlainObject(plan.features),
            ...features
        });
    }

    if (isActive !== undefined) plan.isActive = Boolean(isActive);
    if (sortOrder !== undefined && Number.isFinite(Number(sortOrder))) {
        plan.sortOrder = Number(sortOrder);
    }

    plan.metadata = {
        ...toPlainObject(plan.metadata),
        source: plan.metadata?.source || 'manual',
        updatedBy: req.user?._id
    };

    await plan.save();

    const subscriptionPlanQuery = previousPlanKey === plan.key
        ? { plan: plan.key }
        : { plan: { $in: [previousPlanKey, plan.key] } };
    const subscriptionSet = {
        limits: plan.limits,
        features: plan.features,
        'billing.amount': plan.billing.amount,
        'billing.currency': plan.billing.currency,
        'billing.interval': plan.billing.interval
    };
    if (previousPlanKey !== plan.key) {
        subscriptionSet.plan = plan.key;
    }

    await Subscription.updateMany(
        subscriptionPlanQuery,
        {
            $set: subscriptionSet
        }
    );

    const previousSchoolPlan = toSchoolPlan(previousPlanKey);
    const nextSchoolPlan = toSchoolPlan(plan.key);
    const schoolPlanQuery = previousSchoolPlan === nextSchoolPlan
        ? { 'subscription.plan': nextSchoolPlan }
        : { 'subscription.plan': { $in: [previousSchoolPlan, nextSchoolPlan] } };
    const schoolSet = {
        'settings.features': plan.features
    };
    if (previousSchoolPlan !== nextSchoolPlan) {
        schoolSet['subscription.plan'] = nextSchoolPlan;
    }

    await School.updateMany(
        schoolPlanQuery,
        {
            $set: schoolSet
        }
    );

    res.json({
        success: true,
        message: 'Subscription plan updated successfully',
        data: { plan: serializePlan(plan) }
    });
});

// @desc    Toggle subscription plan active status
// @route   PATCH /api/subscriptions/plans/:id/status
// @access  Private/Super Admin
export const toggleSubscriptionPlanStatus = asyncHandler(async (req, res) => {
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean') {
        return res.status(400).json({
            success: false,
            message: 'isActive must be a boolean'
        });
    }

    const plan = await SubscriptionPlan.findById(req.params.id).setOptions({ skipTenantFilter: true });
    if (!plan) {
        return res.status(404).json({
            success: false,
            message: 'Plan not found'
        });
    }

    plan.isActive = isActive;
    plan.metadata = {
        ...toPlainObject(plan.metadata),
        source: plan.metadata?.source || 'manual',
        updatedBy: req.user?._id
    };
    await plan.save();

    res.json({
        success: true,
        message: `Plan ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { plan: serializePlan(plan) }
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

// @desc    Get subscriptions expiring in next 30 days
// @route   GET /api/subscriptions/expiring
// @access  Private/Super Admin
export const getExpiringSubscriptions = asyncHandler(async (req, res) => {
    const days = Math.max(1, Number.parseInt(req.query.days, 10) || 30);
    const now = new Date();
    const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const subscriptions = await Subscription.find({
        status: { $in: ['active', 'trial'] },
        currentPeriodEnd: { $gte: now, $lte: threshold }
    })
        .populate('school', 'name contact.adminName contact.adminEmail')
        .sort({ currentPeriodEnd: 1 });

    const data = subscriptions.map((subscription) => {
        const currentPeriodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
        const daysRemaining = currentPeriodEnd
            ? Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            : null;

        return {
            ...toPlainObject(subscription),
            daysRemaining
        };
    });

    res.json({
        success: true,
        data: {
            subscriptions: data,
            total: data.length,
            days
        }
    });
});

// @desc    Send manual renewal reminder for subscription
// @route   POST /api/subscriptions/:id/notify
// @access  Private/Super Admin
export const notifySubscriptionRenewal = asyncHandler(async (req, res) => {
    const subscription = await Subscription.findById(req.params.id)
        .populate('school', 'name');

    if (!subscription) {
        return res.status(404).json({
            success: false,
            message: 'Subscription not found'
        });
    }

    const school = subscription.school;
    const admins = await collectSchoolAdmins(subscription.school?._id || subscription.school);
    if (admins.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'No active school admins found to notify'
        });
    }

    const now = new Date();
    const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
    const daysRemaining = periodEnd
        ? Math.ceil((periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null;

    const notifications = await createSubscriptionReminderNotifications({
        school,
        subscription,
        admins,
        subject: 'Subscription renewal reminder',
        message: 'This is a reminder that your subscription is approaching renewal.',
        daysRemaining,
        type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING
    });

    res.json({
        success: true,
        message: 'Renewal reminder sent successfully',
        data: {
            notifications
        }
    });
});

// @desc    Bulk expire overdue subscriptions
// @route   POST /api/subscriptions/bulk-expire
// @access  Private/Super Admin
export const bulkExpireSubscriptions = asyncHandler(async (req, res) => {
    const now = new Date();
    const query = {
        status: { $in: ['active', 'trial'] },
        currentPeriodEnd: { $lt: now }
    };

    const subscriptions = await Subscription.find(query);
    let updated = 0;

    for (const subscription of subscriptions) {
        if (subscription.status !== 'inactive') {
            subscription.status = 'inactive';
            subscription.metadata = {
                ...toPlainObject(subscription.metadata),
                upgradedBy: req.user?._id,
                notes: `Bulk expired by super admin on ${now.toISOString()}`
            };
            await subscription.save();

            await syncSchoolSubscriptionState({
                schoolId: subscription.school,
                plan: subscription.plan,
                status: subscription.status,
                features: subscription.features
            });

            updated += 1;
        }
    }

    res.json({
        success: true,
        message: `Updated ${updated} expired subscriptions`,
        data: { updated }
    });
});
