import School from '../models/School.js';
import AcademicExcellenceExclusion from '../models/AcademicExcellenceExclusion.js';
import { normalizeAcademicExcellenceSettings } from '../utils/academicExcellenceSettings.js';

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    return String(value).trim();
};

const matchesScope = (item = {}, classId = null, subjectId = null) => {
    const overrideClass = toIdString(item.class);
    const overrideSubject = toIdString(item.subject);
    const classKey = toIdString(classId);
    const subjectKey = toIdString(subjectId);

    const classMatches = !overrideClass || overrideClass === classKey;
    const subjectMatches = !overrideSubject || overrideSubject === subjectKey;
    return classMatches && subjectMatches;
};

const validateExclusionPayload = ({ scopeType, targetType, lessonPlanId, objectiveKey, subjectId, classId, studentId }) => {
    if (!['lesson', 'objective', 'subject'].includes(scopeType)) {
        throw new Error('scopeType must be one of lesson, objective, subject');
    }

    if (!['all_students', 'class', 'student'].includes(targetType)) {
        throw new Error('targetType must be one of all_students, class, student');
    }

    if (scopeType === 'lesson' && !lessonPlanId) {
        throw new Error('lessonPlanId is required when scopeType is lesson');
    }
    if (scopeType === 'objective' && !String(objectiveKey || '').trim()) {
        throw new Error('objectiveKey is required when scopeType is objective');
    }
    if (scopeType === 'subject' && !subjectId) {
        throw new Error('subjectId is required when scopeType is subject');
    }

    if (targetType === 'class' && !classId) {
        throw new Error('classId is required when targetType is class');
    }
    if (targetType === 'student' && !studentId) {
        throw new Error('studentId is required when targetType is student');
    }
};

export const getSchoolAcademicExcellenceSettings = async (schoolId) => {
    const school = await School.findById(schoolId).select('settings.academicExcellence').lean();
    if (!school) return null;
    return normalizeAcademicExcellenceSettings(school?.settings?.academicExcellence || {});
};

export const updateSchoolAcademicExcellenceSettings = async (schoolId, updates = {}) => {
    const school = await School.findById(schoolId);
    if (!school) return null;

    const current = normalizeAcademicExcellenceSettings(school?.settings?.academicExcellence || {});
    const merged = {
        ...current,
        ...updates,
        thresholds: {
            ...current.thresholds,
            ...(updates.thresholds || {})
        },
        notificationDefaults: {
            ...current.notificationDefaults,
            ...(updates.notificationDefaults || {}),
            channels: {
                ...current.notificationDefaults?.channels,
                ...(updates.notificationDefaults?.channels || {})
            }
        },
        overrides: Array.isArray(updates.overrides)
            ? updates.overrides
            : current.overrides
    };

    school.settings = school.settings || {};
    school.settings.academicExcellence = normalizeAcademicExcellenceSettings(merged);
    await school.save();

    return normalizeAcademicExcellenceSettings(school.settings.academicExcellence);
};

export const getEffectiveAcademicExcellenceThresholds = async (schoolId, classId = null, subjectId = null) => {
    const settings = await getSchoolAcademicExcellenceSettings(schoolId);
    if (!settings) return null;

    const override = (settings.overrides || []).find((item) => matchesScope(item, classId, subjectId));

    return {
        thresholds: override?.thresholds || settings.thresholds,
        override: override || null
    };
};

export const createExclusion = async (creatorId, exclusionData = {}) => {
    validateExclusionPayload(exclusionData);

    return AcademicExcellenceExclusion.create({
        ...exclusionData,
        createdBy: creatorId,
        isActive: exclusionData.isActive !== false,
        activatedAt: exclusionData.isActive === false ? null : new Date(),
        deactivatedAt: exclusionData.isActive === false ? new Date() : null
    });
};

export const toggleExclusion = async (exclusionId, isActive) => {
    const exclusion = await AcademicExcellenceExclusion.findById(exclusionId);
    if (!exclusion) return null;

    exclusion.isActive = isActive === true;
    if (exclusion.isActive) {
        exclusion.activatedAt = new Date();
        exclusion.deactivatedAt = null;
    } else {
        exclusion.deactivatedAt = new Date();
    }

    await exclusion.save();
    return exclusion;
};

export const getActiveExclusions = async (schoolId, scope = {}) => {
    const {
        classId = null,
        studentId = null,
        scopeType = null,
        targetType = null,
        subjectId = null,
        objectiveKey = null,
        lessonPlanId = null,
        page = 1,
        limit = 100
    } = scope;

    const query = {
        school: schoolId,
        isActive: true
    };

    if (scopeType) query.scopeType = scopeType;
    if (targetType) query.targetType = targetType;
    if (classId) query.classId = classId;
    if (studentId) query.studentId = studentId;
    if (subjectId) query.subjectId = subjectId;
    if (objectiveKey) query.objectiveKey = String(objectiveKey).trim();
    if (lessonPlanId) query.lessonPlanId = lessonPlanId;

    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.max(1, Math.min(200, Number(limit) || 100));

    const [items, total] = await Promise.all([
        AcademicExcellenceExclusion.find(query)
            .sort({ createdAt: -1 })
            .skip((parsedPage - 1) * parsedLimit)
            .limit(parsedLimit)
            .lean(),
        AcademicExcellenceExclusion.countDocuments(query)
    ]);

    return {
        items,
        pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total,
            pages: Math.ceil(total / parsedLimit)
        }
    };
};

export default {
    getSchoolAcademicExcellenceSettings,
    updateSchoolAcademicExcellenceSettings,
    getEffectiveAcademicExcellenceThresholds,
    createExclusion,
    toggleExclusion,
    getActiveExclusions
};
