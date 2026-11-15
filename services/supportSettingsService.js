import SupportSettings, {
    SUPPORT_SETTINGS_DEFAULTS,
    SUPPORT_SETTINGS_ROLES,
} from '../models/SupportSettings.js';
import { supportError } from './supportAccessService.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export const userRoles = (user) => {
    if (!user) return [];
    return [...new Set([user.role, ...(user.roles || [])].filter(Boolean))];
};

export const isSupportAdmin = (user) => userRoles(user).some((role) => (
    role === 'admin' || role === 'super_admin'
));

export const isCounselor = (user) => userRoles(user).includes('counselor');

export const effectiveSettings = (doc) => {
    if (!doc) return clone(SUPPORT_SETTINGS_DEFAULTS);
    const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
        ...clone(SUPPORT_SETTINGS_DEFAULTS),
        ...plain,
        roles: plain.roles?.length ? plain.roles : [...SUPPORT_SETTINGS_DEFAULTS.roles],
        severityCadence: {
            ...SUPPORT_SETTINGS_DEFAULTS.severityCadence,
            ...(plain.severityCadence || {}),
        },
        notifications: {
            ...SUPPORT_SETTINGS_DEFAULTS.notifications,
            ...(plain.notifications || {}),
        },
        integrations: {
            ...SUPPORT_SETTINGS_DEFAULTS.integrations,
            ...(plain.integrations || {}),
        },
    };
};

export const loadSettings = async (schoolId) => {
    const doc = await SupportSettings.findOne({ school: schoolId });
    return effectiveSettings(doc);
};

const boundedInt = (value, { min, max, label }) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw supportError(400, 'SETTINGS_RANGE', `${label} must be a whole number between ${min} and ${max}.`);
    }
    return parsed;
};

const boolean = (value, label) => {
    if (typeof value !== 'boolean') {
        throw supportError(400, 'SETTINGS_TYPE', `${label} must be true or false.`);
    }
    return value;
};

const pickPatch = (patch = {}) => {
    const next = {};
    if ('enabled' in patch) next.enabled = boolean(patch.enabled, 'Enabled');
    if ('label' in patch) {
        if (!['support', 'intervention', 'wellbeing', 'learning_support'].includes(patch.label)) {
            throw supportError(400, 'SETTINGS_ENUM', 'Choose a supported label.');
        }
        next.label = patch.label;
    }
    if ('roles' in patch) {
        if (!Array.isArray(patch.roles)) {
            throw supportError(400, 'SETTINGS_ROLES', 'Participating roles must be a list.');
        }
        const roles = [...new Set(patch.roles.map((role) => String(role)))];
        if (roles.some((role) => !SUPPORT_SETTINGS_ROLES.includes(role))) {
            throw supportError(400, 'SETTINGS_ROLES', 'One of those roles cannot participate yet.');
        }
        next.roles = roles;
    }
    if ('approvalMode' in patch) {
        if (!['owner_release', 'counselor_approve', 'admin_approve'].includes(patch.approvalMode)) {
            throw supportError(400, 'SETTINGS_ENUM', 'Choose a supported approval mode.');
        }
        next.approvalMode = patch.approvalMode;
    }
    if ('ownerFallback' in patch) {
        if (!['homeroom', 'nominator', 'counselor', 'admin'].includes(patch.ownerFallback)) {
            throw supportError(400, 'SETTINGS_ENUM', 'Choose a supported owner fallback.');
        }
        next.ownerFallback = patch.ownerFallback;
    }
    if ('caseloadCap' in patch) {
        next.caseloadCap = boundedInt(patch.caseloadCap, { min: 0, max: 50, label: 'Caseload cap' });
    }
    if ('studentAgeMin' in patch) {
        next.studentAgeMin = boundedInt(patch.studentAgeMin, { min: 0, max: 25, label: 'Minimum student age' });
    }
    if ('studentAgeMax' in patch) {
        next.studentAgeMax = boundedInt(patch.studentAgeMax, { min: 0, max: 25, label: 'Maximum student age' });
    }
    if ('defaultSurveyLength' in patch) {
        next.defaultSurveyLength = boundedInt(patch.defaultSurveyLength, { min: 1, max: 20, label: 'Default survey length' });
    }
    if ('maxSurveyLength' in patch) {
        next.maxSurveyLength = boundedInt(patch.maxSurveyLength, { min: 1, max: 20, label: 'Maximum survey length' });
    }
    if ('reminderDays' in patch) {
        next.reminderDays = boundedInt(patch.reminderDays, { min: 1, max: 30, label: 'Reminder interval' });
    }
    if ('reminderCount' in patch) {
        next.reminderCount = boundedInt(patch.reminderCount, { min: 0, max: 5, label: 'Reminder count' });
    }
    if ('autoSuggestions' in patch) next.autoSuggestions = boolean(patch.autoSuggestions, 'Automatic suggestions');
    if ('aiPlanDrafts' in patch) next.aiPlanDrafts = boolean(patch.aiPlanDrafts, 'AI plan drafts');
    if ('suggestionWindowDays' in patch) {
        next.suggestionWindowDays = boundedInt(patch.suggestionWindowDays, { min: 7, max: 180, label: 'Suggestion window' });
    }
    if ('suggestionAttendanceRate' in patch) {
        next.suggestionAttendanceRate = boundedInt(patch.suggestionAttendanceRate, { min: 1, max: 100, label: 'Attendance threshold' });
    }
    if ('suggestionFailingGrades' in patch) {
        next.suggestionFailingGrades = boundedInt(patch.suggestionFailingGrades, { min: 1, max: 20, label: 'Failing-grade threshold' });
    }
    if ('suggestionBehaviorIncidents' in patch) {
        next.suggestionBehaviorIncidents = boundedInt(patch.suggestionBehaviorIncidents, { min: 1, max: 20, label: 'Behavior-incident threshold' });
    }
    if ('severityCadence' in patch) {
        const cadence = patch.severityCadence || {};
        next.severityCadence = {};
        for (const key of ['watch', 'support', 'intensive']) {
            next.severityCadence[key] = boundedInt(
                cadence[key] ?? SUPPORT_SETTINGS_DEFAULTS.severityCadence[key],
                { min: 1, max: 365, label: `Review interval for ${key}` },
            );
        }
    }
    if ('notifications' in patch) {
        next.notifications = {};
        for (const key of Object.keys(SUPPORT_SETTINGS_DEFAULTS.notifications)) {
            next.notifications[key] = key in (patch.notifications || {})
                ? boolean(patch.notifications[key], `Notification: ${key}`)
                : undefined;
        }
        next.notifications = Object.fromEntries(
            Object.entries(next.notifications).filter(([, value]) => value !== undefined),
        );
    }
    if ('integrations' in patch) {
        next.integrations = {};
        for (const key of Object.keys(SUPPORT_SETTINGS_DEFAULTS.integrations)) {
            next.integrations[key] = key in (patch.integrations || {})
                ? boolean(patch.integrations[key], `Integration: ${key}`)
                : undefined;
        }
        next.integrations = Object.fromEntries(
            Object.entries(next.integrations).filter(([, value]) => value !== undefined),
        );
    }
    return next;
};

export const saveSettings = async ({ schoolId, user, patch }) => {
    if (!isSupportAdmin(user)) {
        throw supportError(403, 'SETTINGS_FORBIDDEN', 'Only a school admin can change support settings.');
    }
    const next = pickPatch(patch);
    const current = await SupportSettings.findOne({ school: schoolId });
    const minAge = next.studentAgeMin ?? current?.studentAgeMin ?? SUPPORT_SETTINGS_DEFAULTS.studentAgeMin;
    const maxAge = next.studentAgeMax ?? current?.studentAgeMax ?? SUPPORT_SETTINGS_DEFAULTS.studentAgeMax;
    if (minAge > maxAge) {
        throw supportError(400, 'SETTINGS_AGE_RANGE', 'The minimum student age cannot be above the maximum.');
    }
    const defaultLength = next.defaultSurveyLength
        ?? current?.defaultSurveyLength
        ?? SUPPORT_SETTINGS_DEFAULTS.defaultSurveyLength;
    const maxLength = next.maxSurveyLength
        ?? current?.maxSurveyLength
        ?? SUPPORT_SETTINGS_DEFAULTS.maxSurveyLength;
    if (defaultLength > maxLength) {
        throw supportError(400, 'SETTINGS_LENGTH_RANGE', 'The default survey length cannot exceed the maximum.');
    }

    const doc = current || new SupportSettings({ school: schoolId });
    for (const [key, value] of Object.entries(next)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            doc[key] = { ...(doc[key]?.toObject?.() || doc[key] || {}), ...value };
        } else {
            doc[key] = value;
        }
    }
    doc.updatedBy = user?._id || null;
    await doc.save();
    return effectiveSettings(doc);
};

export const settingsResponse = async (schoolId, user) => {
    const settings = await loadSettings(schoolId);
    return {
        settings,
        defaults: clone(SUPPORT_SETTINGS_DEFAULTS),
        canManage: isSupportAdmin(user),
        availableRoles: [...SUPPORT_SETTINGS_ROLES],
    };
};

export const assertSupportEnabled = async ({ schoolId, user, settings = null }) => {
    const effective = settings || await loadSettings(schoolId);
    if (!effective.enabled && !isSupportAdmin(user)) {
        throw supportError(403, 'SUPPORT_DISABLED', 'Student support is not enabled for this school.');
    }
    return effective;
};

export const canParticipate = (settings, user) => {
    if (isSupportAdmin(user)) return true;
    const roles = userRoles(user);
    return roles.some((role) => settings.roles.includes(role));
};

export const studentAge = (student, at = new Date()) => {
    const raw = student?.dateOfBirth || student?.dob || null;
    if (!raw) return null;
    const dob = new Date(raw);
    if (Number.isNaN(dob.getTime())) return null;
    let age = at.getFullYear() - dob.getFullYear();
    const beforeBirthday = at.getMonth() < dob.getMonth()
        || (at.getMonth() === dob.getMonth() && at.getDate() < dob.getDate());
    if (beforeBirthday) age -= 1;
    return age >= 0 && age < 120 ? age : null;
};

/** The school age rule decides the default; an explicit per-student choice wins. */
export const studentSurveyDefault = (settings, student) => {
    const age = studentAge(student);
    if (age === null) return false;
    return age >= settings.studentAgeMin && age <= settings.studentAgeMax;
};

export const reviewCadenceFor = (settings, severity) => (
    Number(settings.severityCadence?.[severity]) || SUPPORT_SETTINGS_DEFAULTS.severityCadence.support
);
