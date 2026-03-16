import School from '../models/School.js';
import Subscription from '../models/Subscription.js';

const BLOCKED_STATUSES = new Set(['inactive', 'cancelled', 'suspended', 'expired']);
const ACTIVE_STATUSES = new Set(['active', 'trial']);
const DEFAULT_GRACE_PERIOD_DAYS = 3;

const normalizePath = (value = '') => String(value || '').split('?')[0].replace(/\/$/, '');

const isAllowedPath = (path, allowedPaths = []) => {
    if (!Array.isArray(allowedPaths) || allowedPaths.length === 0) return false;

    return allowedPaths.some((matcher) => {
        if (!matcher) return false;
        if (matcher instanceof RegExp) return matcher.test(path);
        return normalizePath(path) === normalizePath(matcher);
    });
};

const addDays = (date, days) => {
    const value = new Date(date);
    value.setDate(value.getDate() + days);
    return value;
};

const parseGracePeriodDays = (rawValue) => {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_GRACE_PERIOD_DAYS;
    return Math.round(parsed);
};

const resolveSchoolSubscription = async (req) => {
    const schoolSubscription = req.school?.subscription || null;
    const subscription = await Subscription.findOne({ school: req.schoolId })
        .select('plan status trialEndsAt currentPeriodEnd cancelAtPeriodEnd')
        .lean();

    return {
        plan: subscription?.plan || schoolSubscription?.plan || 'starter',
        status: subscription?.status || schoolSubscription?.status || 'inactive',
        trialEndsAt: subscription?.trialEndsAt || schoolSubscription?.trialEndsAt || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || schoolSubscription?.currentPeriodEnd || null,
        cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd ?? schoolSubscription?.cancelAtPeriodEnd)
    };
};

const isTrialValid = (trialEndsAt, now) => {
    if (!trialEndsAt) return true;
    return new Date(trialEndsAt).getTime() >= now.getTime();
};

const hasGraceWindow = ({ status, currentPeriodEnd }, now, gracePeriodDays) => {
    if (status !== 'active') return false;
    if (!currentPeriodEnd) return false;

    const endDate = new Date(currentPeriodEnd);
    if (Number.isNaN(endDate.getTime())) return false;

    const graceEnd = addDays(endDate, gracePeriodDays);
    return now.getTime() <= graceEnd.getTime();
};

export const buildSubscriptionExpiredResponse = ({
    status,
    plan,
    trialEndsAt,
    currentPeriodEnd,
    cancelAtPeriodEnd
}) => {
    let expiredAt = currentPeriodEnd || trialEndsAt || null;

    if (status === 'trial' && trialEndsAt) {
        expiredAt = trialEndsAt;
    }

    if (status === 'cancelled' && cancelAtPeriodEnd && currentPeriodEnd) {
        expiredAt = currentPeriodEnd;
    }

    return {
        success: false,
        error: 'SUBSCRIPTION_EXPIRED',
        message: 'Your subscription has ended. Contact your administrator.',
        subscriptionStatus: status,
        plan,
        expiredAt: expiredAt ? new Date(expiredAt).toISOString() : null
    };
};

export const requireActiveSubscription = (options = {}) => {
    const allowedPaths = options.allowedPaths || [];
    const gracePeriodDays = parseGracePeriodDays(
        options.gracePeriodDays ?? process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS
    );

    return async (req, res, next) => {
        try {
            if (req.user?.role === 'super_admin') {
                return next();
            }

            if (!req.schoolId) {
                return next();
            }

            const path = normalizePath(req.originalUrl || req.path || '');
            if (isAllowedPath(path, allowedPaths)) {
                return next();
            }

            const subscriptionSnapshot = await resolveSchoolSubscription(req);
            const now = new Date();

            const status = String(subscriptionSnapshot.status || '').toLowerCase();
            const plan = subscriptionSnapshot.plan || 'starter';
            const trialEndsAt = subscriptionSnapshot.trialEndsAt;

            const buildExpired = (resolvedStatus) => (
                res.status(402).json(buildSubscriptionExpiredResponse({
                    status: resolvedStatus,
                    plan,
                    trialEndsAt,
                    currentPeriodEnd: subscriptionSnapshot.currentPeriodEnd,
                    cancelAtPeriodEnd: subscriptionSnapshot.cancelAtPeriodEnd
                }))
            );

            if (ACTIVE_STATUSES.has(status)) {
                if (status === 'trial' && !isTrialValid(trialEndsAt, now)) {
                    return buildExpired('inactive');
                }

                if (
                    status === 'active'
                    && subscriptionSnapshot.currentPeriodEnd
                    && new Date(subscriptionSnapshot.currentPeriodEnd).getTime() < now.getTime()
                ) {
                    if (hasGraceWindow(subscriptionSnapshot, now, gracePeriodDays)) {
                        return next();
                    }
                    return buildExpired(subscriptionSnapshot.cancelAtPeriodEnd ? 'cancelled' : 'inactive');
                }

                return next();
            }

            if (BLOCKED_STATUSES.has(status)) {
                if (hasGraceWindow(subscriptionSnapshot, now, gracePeriodDays)) {
                    return next();
                }
                return buildExpired(status);
            }

            const school = await School.findById(req.schoolId).select('subscription').lean();
            const fallbackStatus = String(school?.subscription?.status || status || 'inactive').toLowerCase();
            if (!BLOCKED_STATUSES.has(fallbackStatus) && fallbackStatus !== 'trial') {
                return next();
            }

            return res.status(402).json(buildSubscriptionExpiredResponse({
                status: fallbackStatus,
                plan,
                trialEndsAt: school?.subscription?.trialEndsAt || trialEndsAt,
                currentPeriodEnd: school?.subscription?.currentPeriodEnd || subscriptionSnapshot.currentPeriodEnd,
                cancelAtPeriodEnd: school?.subscription?.cancelAtPeriodEnd || subscriptionSnapshot.cancelAtPeriodEnd
            }));
        } catch (error) {
            return next(error);
        }
    };
};

export default requireActiveSubscription;
