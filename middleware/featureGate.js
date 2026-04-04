import School from '../models/School.js';
import Subscription from '../models/Subscription.js';
import { asyncHandler } from './errorHandler.js';
import {
    coerceFeatureFlags,
    getFeatureDefinition,
    getPlanName,
    getRequiredPlanForFeature,
    normalizePlan
} from '../constants/features.js';

const toPlainObject = (value) => {
    if (!value) return null;
    return typeof value.toObject === 'function' ? value.toObject() : value;
};

// BE-025: Short-lived cache to reduce DB hits for feature resolution
const featureContextCache = new Map();
const FEATURE_CACHE_TTL_MS = 30 * 1000; // 30 seconds

export const resolveSchoolFeatureContext = async (schoolId) => {
    if (!schoolId) return null;

    const cacheKey = schoolId.toString();
    const cached = featureContextCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < FEATURE_CACHE_TTL_MS) {
        return cached.value;
    }

    const [school, subscription] = await Promise.all([
        School.findById(schoolId).select('subscription.plan settings.features').lean(),
        Subscription.findOne({ school: schoolId }).lean()
    ]);

    if (!school) return null;

    const schoolPlan = normalizePlan(school.subscription?.plan);
    const effectivePlan = subscription ? normalizePlan(subscription.plan) : schoolPlan;
    const planConfig = await Subscription.getPlanConfig(effectivePlan);
    const starterPlanConfig = effectivePlan === 'starter' ? planConfig : await Subscription.getPlanConfig('starter');
    const planDefaults = planConfig?.features || starterPlanConfig?.features || {};

    const schoolFeatureOverridesRaw = coerceFeatureFlags(school.settings?.features);
    const schoolFeatureOverrides = subscription
        ? schoolFeatureOverridesRaw
        : Object.keys(schoolFeatureOverridesRaw).reduce((acc, featureKey) => {
            if (schoolFeatureOverridesRaw[featureKey] === true) {
                acc[featureKey] = true;
            }
            return acc;
        }, {});
    const subscriptionFeatureOverrides = subscription
        ? coerceFeatureFlags(subscription.features)
        : {};

    const features = {
        ...planDefaults,
        ...schoolFeatureOverrides,
        ...subscriptionFeatureOverrides
    };

    const fallbackLimits = planConfig?.limits || starterPlanConfig?.limits || {};
    const limits = subscription ? toPlainObject(subscription.limits) : fallbackLimits;

    const result = {
        school,
        subscription,
        plan: effectivePlan,
        planName: getPlanName(effectivePlan),
        features,
        limits
    };

    // BE-025: Cache the resolved context
    featureContextCache.set(cacheKey, { value: result, ts: Date.now() });

    return result;
};

export const buildFeatureMetadata = (features, currentPlan) => {
    return Object.keys(features || {}).reduce((acc, featureKey) => {
        const definition = getFeatureDefinition(featureKey);
        if (!definition) return acc;

        const requiredPlan = getRequiredPlanForFeature(featureKey);
        const requiredPlanName = requiredPlan ? getPlanName(requiredPlan) : null;

        acc[featureKey] = {
            key: featureKey,
            label: definition.label,
            description: definition.description,
            enabled: features[featureKey] === true,
            requiredPlan,
            requiredPlanName,
            currentPlan
        };
        return acc;
    }, {});
};

export const requireFeature = (featureName) => asyncHandler(async (req, res, next) => {
    const featureDefinition = getFeatureDefinition(featureName);
    if (!featureDefinition) {
        return res.status(400).json({
            success: false,
            message: `Unknown feature "${featureName}"`,
            code: 'FEATURE_UNKNOWN',
            requiredFeature: featureName
        });
    }

    if (req.user?.role === 'super_admin') {
        return next();
    }

    if (!req.schoolId) {
        return res.status(400).json({
            success: false,
            message: 'School context required for feature checks'
        });
    }

    const featureContext = await resolveSchoolFeatureContext(req.schoolId);
    if (!featureContext) {
        return res.status(404).json({
            success: false,
            message: 'School not found'
        });
    }

    if (featureContext.features[featureName] === true) {
        req.featureContext = featureContext;
        return next();
    }

    const requiredPlan = getRequiredPlanForFeature(featureName);
    return res.status(403).json({
        success: false,
        message: `${featureDefinition.label} is not enabled for your school's current plan.`,
        code: 'FEATURE_LOCKED',
        requiredFeature: featureName,
        requiredPlan
    });
});
