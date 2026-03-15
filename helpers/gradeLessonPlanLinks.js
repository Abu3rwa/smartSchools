import mongoose from 'mongoose';
import LessonPlan from '../models/LessonPlan.js';

const REVIEW_LESSON_PLANS_PERMISSION = 'review_lesson_plans';

const buildValidationError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const toNormalizedLessonPlanIds = (lessonPlanIds = []) => {
    if (lessonPlanIds === null) return [];
    if (!Array.isArray(lessonPlanIds)) {
        throw buildValidationError('lessonPlanIds must be an array');
    }

    const deduped = new Set();
    for (const rawId of lessonPlanIds) {
        const id = String(rawId || '').trim();
        if (!id) continue;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw buildValidationError(`Invalid lesson plan ID: ${id}`);
        }
        deduped.add(id);
    }

    return Array.from(deduped);
};

const canTeacherReviewAllLessons = (user) => {
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    return permissions.includes(REVIEW_LESSON_PLANS_PERMISSION);
};

/**
 * Validate lessonPlanIds against grade class/subject/school context and user scope.
 * Returns deduplicated ObjectId strings.
 */
export const validateGradeLessonPlanLinks = async ({
    lessonPlanIds,
    schoolId,
    classId,
    subjectId,
    user
}) => {
    if (lessonPlanIds === undefined) {
        return undefined;
    }

    const normalizedIds = toNormalizedLessonPlanIds(lessonPlanIds);
    if (normalizedIds.length === 0) {
        return [];
    }

    if (!classId || !subjectId) {
        throw buildValidationError('Class and subject are required when linking lesson plans');
    }

    const query = {
        _id: { $in: normalizedIds },
        school: schoolId,
        class: classId,
        subject: subjectId
    };

    if (user?.role === 'teacher' && !canTeacherReviewAllLessons(user)) {
        query.teacher = user._id;
    }

    const matchedLessons = await LessonPlan.find(query)
        .select('_id')
        .lean();

    if (matchedLessons.length !== normalizedIds.length) {
        throw buildValidationError(
            'One or more selected lesson plans are invalid for this class/subject or your access scope'
        );
    }

    return normalizedIds;
};

export default validateGradeLessonPlanLinks;
