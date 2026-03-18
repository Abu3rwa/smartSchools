const DEFAULT_ACADEMIC_EXCELLENCE_THRESHOLDS = Object.freeze({
    objectiveWeakThreshold: 70,
    masteryThreshold: 85,
    repeatedWeakCount: 2,
    repeatedWeakWindowDays: 30,
    classWideWeakThreshold: 40
});

const DEFAULT_ACADEMIC_EXCELLENCE_NOTIFICATION_DEFAULTS = Object.freeze({
    onTaskCompleted: true,
    onObjectiveMastered: true,
    onStudentStruggling: true,
    onWeeklyDigest: true,
    channels: {
        inApp: true,
        email: false,
        push: false
    }
});

const DEFAULT_ACADEMIC_EXCELLENCE_BEHAVIOR = Object.freeze({
    autoSyncOnGradeSave: true,
    taskDueDateDefault: 7,
    maxTasksPerObjective: 5
});

const DEFAULT_ACADEMIC_EXCELLENCE_TRACKING_MODE = 'objectives';

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    return String(value).trim();
};

const toNumberInRange = ({ value, fallback, min, max }) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
};

const normalizeThresholds = (input = {}) => ({
    objectiveWeakThreshold: toNumberInRange({
        value: input.objectiveWeakThreshold,
        fallback: DEFAULT_ACADEMIC_EXCELLENCE_THRESHOLDS.objectiveWeakThreshold,
        min: 1,
        max: 100
    }),
    masteryThreshold: toNumberInRange({
        value: input.masteryThreshold,
        fallback: DEFAULT_ACADEMIC_EXCELLENCE_THRESHOLDS.masteryThreshold,
        min: 1,
        max: 100
    }),
    repeatedWeakCount: toNumberInRange({
        value: input.repeatedWeakCount,
        fallback: DEFAULT_ACADEMIC_EXCELLENCE_THRESHOLDS.repeatedWeakCount,
        min: 1,
        max: 20
    }),
    repeatedWeakWindowDays: toNumberInRange({
        value: input.repeatedWeakWindowDays,
        fallback: DEFAULT_ACADEMIC_EXCELLENCE_THRESHOLDS.repeatedWeakWindowDays,
        min: 1,
        max: 365
    }),
    classWideWeakThreshold: toNumberInRange({
        value: input.classWideWeakThreshold,
        fallback: DEFAULT_ACADEMIC_EXCELLENCE_THRESHOLDS.classWideWeakThreshold,
        min: 1,
        max: 100
    })
});

const normalizeOverride = (override = {}) => ({
    class: toIdString(override.class),
    subject: toIdString(override.subject),
    thresholds: normalizeThresholds(override.thresholds || {})
});

const normalizeChannels = (channels = {}) => ({
    inApp: channels.inApp !== false,
    email: channels.email === true,
    push: channels.push === true
});

const normalizeNotificationDefaults = (input = {}) => ({
    onTaskCompleted: input.onTaskCompleted !== false,
    onObjectiveMastered: input.onObjectiveMastered !== false,
    onStudentStruggling: input.onStudentStruggling !== false,
    onWeeklyDigest: input.onWeeklyDigest !== false,
    channels: normalizeChannels(input.channels || {})
});

const normalizeBehavior = (input = {}) => ({
    autoSyncOnGradeSave: input.autoSyncOnGradeSave !== false,
    taskDueDateDefault: toNumberInRange({
        value: input.taskDueDateDefault,
        fallback: DEFAULT_ACADEMIC_EXCELLENCE_BEHAVIOR.taskDueDateDefault,
        min: 1,
        max: 60
    }),
    maxTasksPerObjective: toNumberInRange({
        value: input.maxTasksPerObjective,
        fallback: DEFAULT_ACADEMIC_EXCELLENCE_BEHAVIOR.maxTasksPerObjective,
        min: 1,
        max: 50
    })
});

const normalizeTrackingMode = (value) => {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'standards') return 'standards';
    if (mode === 'objectives') return 'objectives';
    return DEFAULT_ACADEMIC_EXCELLENCE_TRACKING_MODE;
};

export const normalizeAcademicExcellenceSettings = (input = {}) => ({
    enabled: input.enabled !== false,
    studentDashboardEnabled: input.studentDashboardEnabled !== false,
    practiceTasksEnabled: input.practiceTasksEnabled !== false,
    selfInitiatedPracticeEnabled: input.selfInitiatedPracticeEnabled !== false,
    trackingMode: normalizeTrackingMode(input.trackingMode),
    thresholds: normalizeThresholds(input.thresholds || {}),
    overrides: Array.isArray(input.overrides)
        ? input.overrides
            .map(normalizeOverride)
            .filter((item) => item.class || item.subject)
        : [],
    notificationDefaults: normalizeNotificationDefaults(input.notificationDefaults || DEFAULT_ACADEMIC_EXCELLENCE_NOTIFICATION_DEFAULTS),
    ...normalizeBehavior(input)
});

export {
    DEFAULT_ACADEMIC_EXCELLENCE_THRESHOLDS,
    DEFAULT_ACADEMIC_EXCELLENCE_NOTIFICATION_DEFAULTS,
    DEFAULT_ACADEMIC_EXCELLENCE_BEHAVIOR,
    DEFAULT_ACADEMIC_EXCELLENCE_TRACKING_MODE
};
