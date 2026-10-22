import BehaviorSettings from '../../models/BehaviorSettings.js';

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

/**
 * Deployment switch. BEHAVIOR_SYSTEM_ENABLED=true turns the module on for every
 * school and =false forces it off, without rewriting behavior_settings. When the
 * variable is unset the per-school flag stays authoritative. While it is set the
 * in-app enable toggle has no effect, because the environment wins.
 */
const envFlagOverride = () => {
    const value = String(process.env.BEHAVIOR_SYSTEM_ENABLED ?? '').trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(value)) return true;
    if (['0', 'false', 'no', 'off'].includes(value)) return false;
    return null;
};

const withEnvFlag = (settings) => {
    const override = envFlagOverride();
    if (override === null || !settings) return settings;
    return { ...settings, enabled: override };
};

export const invalidateBehaviorSettingsCache = (schoolId) => {
    if (!schoolId) return;
    cache.delete(String(schoolId));
};

const readCache = (schoolId) => {
    const entry = cache.get(String(schoolId));
    if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.value;
    return null;
};

/**
 * Settings are read on almost every behavior request, so the resolved document
 * is cached briefly and dropped whenever it is written.
 */
export const getBehaviorSettings = async (schoolId) => {
    const cached = readCache(schoolId);
    if (cached) return withEnvFlag(cached);

    // $setOnInsert keeps the default document creation atomic, so two parallel
    // first reads cannot raise a duplicate-key error.
    const settings = await BehaviorSettings.findOneAndUpdate(
        { school: schoolId },
        { $setOnInsert: { school: schoolId } },
        { new: true, upsert: true, lean: true }
    );

    cache.set(String(schoolId), { value: settings, ts: Date.now() });
    return withEnvFlag(settings);
};

export const isBehaviorSystemEnabled = async (schoolId) => {
    const settings = await getBehaviorSettings(schoolId);
    return settings?.enabled === true;
};

const clamp = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);

const sanitizePatch = (patch = {}) => {
    const next = { ...patch };

    if (next.counting) {
        next.counting = { ...next.counting };
        if (next.counting.rollingDays !== undefined) {
            next.counting.rollingDays = clamp(next.counting.rollingDays, 1, 366);
        }
    }

    if (next.approval) {
        // A timed-out approval must never release anything on its own.
        delete next.approval.autoSendOnTimeout;
        next.approval = { ...next.approval, autoSendOnTimeout: false };
    }

    if (next.sendDelayMaxMinutes !== undefined || next.sendDelayMinutes !== undefined) {
        const maxDelay = clamp(next.sendDelayMaxMinutes ?? 240, 0, 240);
        next.sendDelayMaxMinutes = maxDelay;
        if (next.sendDelayMinutes !== undefined) {
            next.sendDelayMinutes = clamp(next.sendDelayMinutes, 0, maxDelay);
        }
    }

    if (next.emailDelivery) {
        const block = { ...next.emailDelivery };
        // The school's own half of the send switch. Delivery still requires the
        // deployment-wide BEHAVIOR_EMAIL_DELIVERY gate and the step's approval.
        block.enabled = block.enabled === true;
        if (block.supportedLanguages !== undefined) {
            const languages = [...new Set((block.supportedLanguages || [])
                .filter((code) => ['en', 'ar'].includes(code)))];
            block.supportedLanguages = languages.length ? languages : ['en'];
        }
        if (block.defaultLanguage !== undefined && !['en', 'ar'].includes(block.defaultLanguage)) {
            block.defaultLanguage = 'en';
        }
        next.emailDelivery = block;
    }

    return next;
};

export const updateBehaviorSettings = async ({ schoolId, patch, actorId }) => {
    const settings = await BehaviorSettings.findOneAndUpdate(
        { school: schoolId },
        { $set: { ...sanitizePatch(patch), updatedBy: actorId } },
        { new: true, lean: true, upsert: true }
    );

    invalidateBehaviorSettingsCache(schoolId);
    return withEnvFlag(settings);
};

/**
 * Which roles may decide an approval for a step. A step can narrow the list but
 * never widen it past the school-wide approvers.
 */
export const resolveApproverRoles = (settings, step = null) => {
    const globalRoles = settings?.approval?.approverRoles || [];
    const stepRoles = step?.approverRoles || [];
    if (!stepRoles.length) return globalRoles;
    return stepRoles.filter((role) => globalRoles.includes(role));
};

export const stepRequiresApproval = (settings, step = null) => {
    if (step?.requiresApproval === true || step?.requiresApproval === false) {
        return step.requiresApproval;
    }
    return settings?.approval?.defaultRequired !== false;
};
