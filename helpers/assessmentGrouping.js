import { randomUUID } from 'crypto';

const safeValue = (value = '') => String(value || '').trim();

const normalizeDateKey = (value) => {
    const date = value ? new Date(value) : null;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'undated';
    return date.toISOString().slice(0, 10);
};

export const generateAssessmentGroupId = (prefix = 'asg') => `${prefix}_${randomUUID()}`;

export const buildLegacyAssessmentGroupKey = (grade = {}) => {
    const classId = safeValue(grade?.class?._id || grade?.class || 'class');
    const subjectId = safeValue(grade?.subject?._id || grade?.subject || 'subject');
    const title = safeValue(grade?.title || grade?.examName || grade?.gradeType || 'assessment')
        .toLowerCase()
        .replace(/\s+/g, '_');
    const dateKey = normalizeDateKey(grade?.date);
    return `${classId}:${subjectId}:${title}:${dateKey}`;
};

export const resolveAssessmentGroupKeyFromGrade = (grade = {}) => {
    const explicit = safeValue(grade?.assessmentGroupId);
    return explicit || buildLegacyAssessmentGroupKey(grade);
};