import Subscription from '../models/Subscription.js';
import School from '../models/School.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { syncSchoolSubscriptionState } from '../controllers/subscriptionController.js';
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js';
import { sendSubscriptionEventEmail } from '../services/subscriptionEmailService.js';
import logger from '../utils/logger.js';

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const WARNING_WINDOWS_DAYS = [7, 1];
const TRIAL_WARNING_DAYS = 3;

const getDaysUntil = (targetDate, now) => {
    if (!targetDate) return null;
    const target = new Date(targetDate);
    if (Number.isNaN(target.getTime())) return null;

    return Math.ceil((target.getTime() - now.getTime()) / MILLIS_PER_DAY);
};

const hasNotificationForWindow = async ({ schoolId, type, subscriptionId, daysRemaining }) => {
    const since = new Date(Date.now() - 36 * 60 * 60 * 1000);

    const existing = await Notification.findOne({
        school: schoolId,
        type,
        'metadata.subscriptionId': String(subscriptionId),
        'metadata.daysRemaining': daysRemaining,
        createdAt: { $gte: since }
    })
        .select('_id')
        .setOptions({ skipTenantFilter: true })
        .lean();

    return Boolean(existing);
};

const createAdminNotifications = async ({
    school,
    admins,
    subscription,
    type,
    subject,
    message,
    daysRemaining,
    expiresAt
}) => {
    if (!school || !Array.isArray(admins) || admins.length === 0) return 0;

    const metadata = {
        subscriptionId: String(subscription._id),
        planName: subscription.plan,
        expiresAt,
        daysRemaining,
        billingInterval: subscription.billing?.interval === 'year' ? 'annually' : 'monthly'
    };

    const alreadySent = await hasNotificationForWindow({
        schoolId: school._id,
        type,
        subscriptionId: subscription._id,
        daysRemaining
    });

    if (alreadySent) return 0;

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

    if (payload.length === 0) return 0;

    await Notification.insertMany(payload, { ordered: false });

    await Promise.allSettled(
        admins.map((admin) => sendSubscriptionEventEmail({
            eventType: type,
            recipientEmail: admin.email,
            schoolId: school._id,
            schoolName: school.name,
            planName: subscription.plan,
            billingInterval: subscription.billing?.interval === 'year' ? 'annually' : 'monthly',
            expiresAt,
            nextBillingDate: subscription.billing?.nextBillingAt || subscription.currentPeriodEnd,
            daysRemaining,
            preferredUserId: admin._id
        }))
    );

    return payload.length;
};

const transitionSubscription = async ({ subscription, nextStatus, now }) => {
    if (subscription.status === nextStatus) return false;

    // BE-010: Atomic status transition using findOneAndUpdate with precondition
    const previousStatus = subscription.status;
    const updateFields = {
        status: nextStatus,
        'metadata.notes': `Lifecycle job set status to ${nextStatus} on ${now.toISOString()}`
    };
    if (nextStatus === 'inactive') {
        updateFields['billing.nextBillingAt'] = null;
    }

    const updated = await Subscription.findOneAndUpdate(
        { _id: subscription._id, status: previousStatus },
        { $set: updateFields },
        { new: true }
    ).setOptions({ skipTenantFilter: true });

    if (!updated) return false; // Another process already transitioned it

    await syncSchoolSubscriptionState({
        schoolId: updated.school,
        plan: updated.plan,
        status: updated.status,
        features: updated.features
    });

    return true;
};

export const runSubscriptionLifecycleJob = async ({ now = new Date() } = {}) => {
    const result = {
        processed: 0,
        statusTransitions: 0,
        notificationsCreated: 0,
        errors: []
    };

    const subscriptions = await Subscription.find({
        status: { $in: ['trial', 'active', 'inactive'] }
    })
        .populate('school', 'name')
        .setOptions({ skipTenantFilter: true });

    for (const subscription of subscriptions) {
        result.processed += 1;

        try {
            const school = await School.findById(subscription.school?._id || subscription.school)
                .select('name')
                .setOptions({ skipTenantFilter: true })
                .lean();
            const admins = await User.find({
                school: subscription.school,
                role: 'admin',
                isActive: true
            })
                .select('email')
                .setOptions({ skipTenantFilter: true })
                .lean();

            if (!school) continue;

            const trialEndsAt = subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
            const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;

            if (subscription.status === 'trial' && trialEndsAt && trialEndsAt.getTime() < now.getTime()) {
                const changed = await transitionSubscription({
                    subscription,
                    nextStatus: 'inactive',
                    now
                });

                if (changed) {
                    result.statusTransitions += 1;
                    result.notificationsCreated += await createAdminNotifications({
                        school,
                        admins,
                        subscription,
                        type: NOTIFICATION_TYPES.SUBSCRIPTION_TRIAL_EXPIRED,
                        subject: 'Your trial has ended',
                        message: 'Your school trial period has ended. Contact support to continue access.',
                        daysRemaining: 0,
                        expiresAt: trialEndsAt?.toISOString() || null
                    });
                }

                continue;
            }

            if (
                subscription.status === 'active'
                && subscription.cancelAtPeriodEnd === true
                && periodEnd
                && periodEnd.getTime() < now.getTime()
            ) {
                const changed = await transitionSubscription({
                    subscription,
                    nextStatus: 'cancelled',
                    now
                });

                if (changed) {
                    result.statusTransitions += 1;
                    result.notificationsCreated += await createAdminNotifications({
                        school,
                        admins,
                        subscription,
                        type: NOTIFICATION_TYPES.SUBSCRIPTION_CANCELLED,
                        subject: 'Subscription cancelled',
                        message: 'Your subscription has been cancelled at period end.',
                        daysRemaining: 0,
                        expiresAt: periodEnd?.toISOString() || null
                    });
                }

                continue;
            }

            if (
                subscription.status === 'active'
                && periodEnd
                && periodEnd.getTime() < now.getTime()
                && subscription.cancelAtPeriodEnd !== true
            ) {
                const changed = await transitionSubscription({
                    subscription,
                    nextStatus: 'inactive',
                    now
                });

                if (changed) {
                    result.statusTransitions += 1;
                    result.notificationsCreated += await createAdminNotifications({
                        school,
                        admins,
                        subscription,
                        type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED,
                        subject: 'Your subscription has ended',
                        message: 'Your subscription has expired. Contact support to renew.',
                        daysRemaining: 0,
                        expiresAt: periodEnd?.toISOString() || null
                    });
                }

                continue;
            }

            if (subscription.status === 'trial' && trialEndsAt) {
                const trialDaysRemaining = getDaysUntil(trialEndsAt, now);
                if (trialDaysRemaining === TRIAL_WARNING_DAYS) {
                    result.notificationsCreated += await createAdminNotifications({
                        school,
                        admins,
                        subscription,
                        type: NOTIFICATION_TYPES.SUBSCRIPTION_TRIAL_ENDING,
                        subject: 'Your trial ends in 3 days',
                        message: 'Your school trial ends in 3 days. Renew now to avoid interruption.',
                        daysRemaining: trialDaysRemaining,
                        expiresAt: trialEndsAt.toISOString()
                    });
                }
            }

            if (subscription.status === 'active' && periodEnd) {
                const daysRemaining = getDaysUntil(periodEnd, now);
                if (WARNING_WINDOWS_DAYS.includes(daysRemaining)) {
                    result.notificationsCreated += await createAdminNotifications({
                        school,
                        admins,
                        subscription,
                        type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
                        subject: daysRemaining === 1
                            ? 'Action required: subscription expires tomorrow'
                            : 'Your subscription renews in 7 days',
                        message: daysRemaining === 1
                            ? 'Your subscription expires tomorrow. Please renew to avoid interruption.'
                            : 'Your subscription renews in 7 days. Please ensure billing is up to date.',
                        daysRemaining,
                        expiresAt: periodEnd.toISOString()
                    });
                }
            }
        } catch (error) {
            result.errors.push({
                subscriptionId: String(subscription._id),
                message: error?.message || 'Lifecycle job error'
            });
            logger.error('subscription_lifecycle_job_error', {
                subscriptionId: String(subscription._id),
                message: error?.message || error
            });
        }
    }

    return result;
};

export default runSubscriptionLifecycleJob;
