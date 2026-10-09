import AssignmentClassroomLink from '../models/AssignmentClassroomLink.js';
import ClassroomCourseMapping from '../models/ClassroomCourseMapping.js';
import SchoolCalendarConfig from '../models/SchoolCalendarConfig.js';
import { DEFAULT_SCHOOL_TIMEZONE, resolveTimeZone } from '../utils/schoolTimezone.js';
import { isClassroomEnabledForSchool } from '../config/classroomConfig.js';
import logger from '../utils/logger.js';
import classroomOAuthService from './googleClassroomOAuthService.js';
import {
    buildCourseWorkPatch,
    buildCourseWorkPayload,
    createCourseWork,
    patchCourseWork
} from './googleClassroomService.js';
import { ClassroomSyncError, normalizeGoogleError } from './classroomErrors.js';

const PENDING_STALE_MS = 2 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;

const toId = (value) => (value == null ? '' : String(value));

const defaultDeps = {
    getAuthorizedClient: (userId) => classroomOAuthService.getAuthorizedClient(userId),
    createCourseWork,
    patchCourseWork,
    findLink: (assignmentId, schoolId) =>
        AssignmentClassroomLink.findOne({ assignment: assignmentId, school: schoolId }),
    createLink: (data) => AssignmentClassroomLink.create(data),
    findMapping: ({ schoolId, classId, subjectId, academicYear, userId }) =>
        ClassroomCourseMapping.findOne({
            school: schoolId,
            class: classId,
            subject: subjectId,
            academicYear,
            mappedBy: userId,
            isActive: true
        }),
    getTimeZone: async (schoolId) => {
        const config = await SchoolCalendarConfig.findOne({ school: schoolId }).select('timezone');
        return resolveTimeZone(config?.timezone) || DEFAULT_SCHOOL_TIMEZONE;
    },
    now: () => new Date()
};

const isFreshPending = (link, now) =>
    link.syncState === 'pending'
    && !link.courseWorkId
    && now.getTime() - new Date(link.updatedAt || 0).getTime() < PENDING_STALE_MS;

const safeSave = async (link) => {
    try {
        await link.save();
    } catch (saveError) {
        logger.error('Failed to save Classroom link state', {
            linkId: toId(link?._id),
            message: saveError?.message
        });
    }
};

const recordFailure = async (link, error) => {
    if (!link) return;
    link.lastErrorCode = error.code;
    link.lastError = String(error.message || '').slice(0, MAX_ERROR_LENGTH);
    // Coursework that already exists in Classroom keeps its state; only never-created posts are "failed".
    if (!link.courseWorkId) link.syncState = 'failed';
    await safeSave(link);
};

const applySuccess = (link, data, body, now) => {
    link.courseWorkId = String(data.id || link.courseWorkId || '');
    link.alternateLink = data.alternateLink || link.alternateLink || '';
    link.syncState = data.state === 'PUBLISHED' ? 'published' : (data.state === 'DRAFT' ? 'draft' : link.syncState);
    link.dueDateSynced = Boolean(body.dueDate);
    link.lastSyncedAt = now;
    link.lastErrorCode = '';
    link.lastError = '';
};

const summarize = (link) => ({
    syncState: link.syncState,
    courseId: link.courseId,
    courseWorkId: link.courseWorkId || null,
    alternateLink: link.alternateLink || '',
    lastSyncedAt: link.lastSyncedAt || null,
    lastErrorCode: link.lastErrorCode || '',
    lastError: link.lastError || ''
});

export const summarizeLink = summarize;

/**
 * Creates or updates the Classroom coursework for an app assignment.
 * Never throws: failures are recorded on the link and returned so the app-side operation always succeeds.
 *
 * @param createIfMissing - when false, only assignments already linked to Classroom are synced.
 */
export const syncAssignmentToClassroom = async ({ assignment, actor, createIfMissing = false, deps = defaultDeps }) => {
    const schoolId = assignment.school;
    if (!isClassroomEnabledForSchool(schoolId)) return { skipped: true, reason: 'DISABLED' };

    let link = null;
    try {
        link = await deps.findLink(assignment._id, schoolId);
        if (!link && !createIfMissing) return { skipped: true, reason: 'NO_LINK' };

        if (link && toId(link.createdBy) !== toId(actor?._id)) {
            // Only the teacher whose Google account created the coursework can modify it.
            const error = new ClassroomSyncError(
                'OUT_OF_SYNC',
                'Changes were made by another user and are not in Google Classroom yet. The teacher who posted it can sync it again.'
            );
            await recordFailure(link, error);
            return { ok: false, code: error.code, message: error.message, link: summarize(link) };
        }

        if (actor?.role !== 'teacher') {
            throw new ClassroomSyncError('TEACHER_ONLY', 'Only the assigned teacher can post to Google Classroom.');
        }
        if (assignment.scope !== 'class') {
            throw new ClassroomSyncError(
                'UNSUPPORTED_SCOPE',
                'Assignments for selected students cannot be posted to Google Classroom yet.'
            );
        }

        const now = deps.now();
        if (link && isFreshPending(link, now)) {
            return { ok: false, code: 'IN_PROGRESS', message: 'Posting to Google Classroom is already in progress.', link: summarize(link) };
        }

        const timeZone = await deps.getTimeZone(schoolId);

        if (link?.courseWorkId) {
            if (toId(link.class) !== toId(assignment.class) || toId(link.subject) !== toId(assignment.subject)) {
                throw new ClassroomSyncError(
                    'CLASS_CHANGED',
                    "This assignment's class or subject changed after it was posted. Update it in Google Classroom manually."
                );
            }
            const { auth } = await deps.getAuthorizedClient(actor._id);
            const patch = buildCourseWorkPatch({ assignment, timeZone, link });
            const data = await deps.patchCourseWork(auth, link.courseId, link.courseWorkId, patch);
            applySuccess(link, data, patch.requestBody, now);
            await link.save();
            return { ok: true, link: summarize(link) };
        }

        const mapping = await deps.findMapping({
            schoolId,
            classId: toId(assignment.class),
            subjectId: toId(assignment.subject),
            academicYear: assignment.academicYear,
            userId: actor._id
        });
        if (!mapping) {
            throw new ClassroomSyncError(
                'MAPPING_NOT_FOUND',
                'Map this class and subject to a Google Classroom course before posting.'
            );
        }

        if (!link) {
            try {
                link = await deps.createLink({
                    school: schoolId,
                    assignment: assignment._id,
                    createdBy: actor._id,
                    courseId: mapping.courseId,
                    class: assignment.class,
                    subject: assignment.subject,
                    syncState: 'pending'
                });
            } catch (error) {
                if (error?.code === 11000) {
                    const existing = await deps.findLink(assignment._id, schoolId);
                    return {
                        ok: false,
                        code: 'IN_PROGRESS',
                        message: 'Posting to Google Classroom is already in progress.',
                        ...(existing ? { link: summarize(existing) } : {})
                    };
                }
                throw error;
            }
        } else {
            // Retry of a post that never reached Classroom; the mapping may have changed since.
            link.courseId = mapping.courseId;
            link.syncState = 'pending';
            link.class = assignment.class;
            link.subject = assignment.subject;
            await link.save();
        }

        const { auth } = await deps.getAuthorizedClient(actor._id);
        const body = buildCourseWorkPayload({ assignment, timeZone });
        const data = await deps.createCourseWork(auth, link.courseId, body);
        applySuccess(link, data, body, now);
        await link.save();
        return { ok: true, link: summarize(link) };
    } catch (rawError) {
        const error = rawError instanceof ClassroomSyncError ? rawError : normalizeGoogleError(rawError);
        logger.warn('Google Classroom sync failed', {
            assignmentId: toId(assignment?._id),
            code: error.code,
            status: error.status
        });
        await recordFailure(link, error);
        return {
            ok: false,
            code: error.code,
            message: error.message,
            retryable: error.retryable,
            ...(link ? { link: summarize(link) } : {})
        };
    }
};
