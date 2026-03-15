const DEFAULT_THRESHOLDS = Object.freeze({
    objectiveWeakThreshold: 70,
    repeatedWeakCount: 2,
    repeatedWeakWindowDays: 30,
    classWideWeakThreshold: 40
});

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    return String(value).trim();
};

const toPositiveNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeThresholds = (input = {}) => ({
    objectiveWeakThreshold: toPositiveNumber(input.objectiveWeakThreshold, DEFAULT_THRESHOLDS.objectiveWeakThreshold),
    repeatedWeakCount: toPositiveNumber(input.repeatedWeakCount, DEFAULT_THRESHOLDS.repeatedWeakCount),
    repeatedWeakWindowDays: toPositiveNumber(input.repeatedWeakWindowDays, DEFAULT_THRESHOLDS.repeatedWeakWindowDays),
    classWideWeakThreshold: toPositiveNumber(input.classWideWeakThreshold, DEFAULT_THRESHOLDS.classWideWeakThreshold)
});

const normalizeOverride = (override = {}) => ({
    class: toIdString(override.class),
    subject: toIdString(override.subject),
    thresholds: normalizeThresholds(override.thresholds || {})
});

export const normalizeAcademicIntelligenceSettings = (input = {}) => ({
    thresholds: normalizeThresholds(input.thresholds || {}),
    overrides: Array.isArray(input.overrides)
        ? input.overrides
            .map(normalizeOverride)
            .filter((item) => item.class || item.subject)
        : []
});

export const getAcademicIntelligenceSettingsFromSchool = ({ school, classId = null, subjectId = null } = {}) => {
    const normalized = normalizeAcademicIntelligenceSettings(school?.settings?.academicIntelligence || {});
    const classKey = toIdString(classId);
    const subjectKey = toIdString(subjectId);

    const matchedOverride = normalized.overrides.find((item) => {
        const classMatches = !item.class || item.class === classKey;
        const subjectMatches = !item.subject || item.subject === subjectKey;
        return classMatches && subjectMatches;
    });

    return {
        thresholds: matchedOverride?.thresholds || normalized.thresholds,
        override: matchedOverride || null
    };
};

export { DEFAULT_THRESHOLDS as DEFAULT_ACADEMIC_INTELLIGENCE_THRESHOLDS };