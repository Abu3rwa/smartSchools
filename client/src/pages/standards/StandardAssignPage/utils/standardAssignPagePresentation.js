import { DIFFICULTY_OPTIONS, QUESTION_TYPE_OPTIONS } from '../constants';
import { formatStandardLabel } from '../../../../utils/standardLabel';

export const getEntityId = (entity) => (entity?._id || entity || '').toString();

export const getTeacherUserId = (subjectEntry) =>
    (
        subjectEntry?.teacher?.user?._id ||
        subjectEntry?.teacher?.user ||
        subjectEntry?.teacher ||
        ''
    ).toString();

export const getScopedClassSubjects = (schoolClass, isTeacher, userId) => {
    const classSubjectsRaw = Array.isArray(schoolClass?.subjects) ? schoolClass.subjects : [];
    const scopedEntries = classSubjectsRaw.filter((entry) => {
        if (!entry?.subject) return false;
        if (!isTeacher) return true;
        return getTeacherUserId(entry) === getEntityId(userId);
    });

    const seen = new Set();
    return scopedEntries
        .map((entry) => entry.subject)
        .filter((subject) => {
            const subjectId = getEntityId(subject);
            if (!subjectId || seen.has(subjectId)) return false;
            seen.add(subjectId);
            return true;
        });
};

export const getStandardDescription = (standard) => {
    const description = (standard?.description || '').trim();
    if (description) return description;
    const fallbackName = (standard?.name || '').trim();
    if (fallbackName) return fallbackName;
    return 'No description available for this standard yet.';
};

export const getStandardOptionLabel = (standard) => {
    const baseLabel = formatStandardLabel(standard) || `${standard?.code || 'STD'}`;
    const description = getStandardDescription(standard);
    const shortDescription =
        description.length > 90 ? `${description.substring(0, 90)}...` : description;
    const gradePart = `Grade ${standard?.gradeLevel || '-'}`;
    return `${baseLabel} (${gradePart}) | ${shortDescription}`;
};

export const parseNullablePositiveInt = (value) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
};

export const toDateInput = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
};

export const toDateTimeLocalInput = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
};

export const buildAssignmentEditForm = (assignment, selectedSemester) => {
    return {
        title: assignment?.title || '',
        standardId: assignment?.standard?._id || assignment?.standard || '',
        classId: assignment?.class?._id || assignment?.class || '',
        subjectId: assignment?.subject?._id || assignment?.subject || '',
        semester: assignment?.semester || selectedSemester || 1,
        students: Array.isArray(assignment?.students)
            ? assignment.students.map((student) => student?._id || student).filter(Boolean)
            : [],
        dueDate: toDateInput(assignment?.dueDate),
        instructions: assignment?.instructions || '',
        practiceConfig: {
            sessionType: assignment?.practiceConfig?.sessionType || 'practice',
            questionLimit: assignment?.practiceConfig?.questionLimit || '',
            timeLimitSeconds: assignment?.practiceConfig?.timeLimitSeconds
                ? Math.round(Number(assignment.practiceConfig.timeLimitSeconds) / 60)
                : '',
            allowedQuestionTypes: assignment?.practiceConfig?.allowedQuestionTypes?.length
                ? assignment.practiceConfig.allowedQuestionTypes
                : [...QUESTION_TYPE_OPTIONS],
            allowedDifficulties: assignment?.practiceConfig?.allowedDifficulties?.length
                ? assignment.practiceConfig.allowedDifficulties
                : [...DIFFICULTY_OPTIONS],
            availability: {
                startAt: toDateTimeLocalInput(assignment?.practiceConfig?.availability?.startAt),
                endAt: toDateTimeLocalInput(assignment?.practiceConfig?.availability?.endAt)
            },
            lockStudentOptions: Boolean(assignment?.practiceConfig?.lockStudentOptions)
        },
        assessmentConfig: {
            maxMarks: String(assignment?.assessmentConfig?.maxMarks || 100),
            passMarks: String(assignment?.assessmentConfig?.passMarks || 40),
            resultsVisibility: assignment?.assessmentConfig?.resultsVisibility || 'immediate',
            resultsReleaseAt: toDateTimeLocalInput(assignment?.assessmentConfig?.resultsReleaseAt)
        }
    };
};

export const getMasteryColor = (pct) => {
    if (pct >= 80) return 'green';
    if (pct >= 40) return 'yellow';
    return 'red';
};

export const getProgressStatusDisplay = (status) => {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'mastered') return { label: 'Mastered', className: 'mastered' };
    if (normalized === 'needs_review') return { label: 'Needs Review', className: 'needs-review' };
    if (normalized === 'in_progress') return { label: 'In Progress', className: 'in-progress' };
    return { label: 'Not Started', className: 'not-started' };
};
