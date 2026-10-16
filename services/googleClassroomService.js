import { google } from 'googleapis';
import { toClassroomDue } from '../utils/classroomDueDate.js';
import { withRetry } from './classroomErrors.js';

const MAX_TITLE_LENGTH = 3000;
const MAX_DESCRIPTION_LENGTH = 30000;
const MAX_COURSE_PAGES = 5;

const clip = (value, max) => String(value || '').slice(0, max);

/** Only the assignment instructions belong in the description; external URLs become Classroom materials. */
export const buildDescription = (assignment) => {
    return clip(String(assignment?.instructions || '').trim(), MAX_DESCRIPTION_LENGTH);
};

export const buildCourseWorkMaterials = (assignment) => (
    [
        ...(Array.isArray(assignment?.links) ? assignment.links : [])
            .filter((link) => link?.type === 'external_url')
            .map((link) => ({ url: link.url, title: link.title })),
        ...(assignment?.metadata?.googleForm?.responderUri
            ? [{ url: assignment.metadata.googleForm.responderUri, title: 'Google Form' }]
            : [])
    ]
        .map((link) => {
            const rawUrl = String(link.url || '').trim();
            try {
                const url = new URL(rawUrl);
                if (!['http:', 'https:'].includes(url.protocol)
                    || !url.hostname
                    || ['localhost', '[::1]', '0.0.0.0'].includes(url.hostname)
                    || url.hostname.endsWith('.localhost')
                    || /^127\./.test(url.hostname)) {
                    return null;
                }
                return {
                    link: {
                        url: url.href,
                        title: clip(link.title || url.hostname, 1000)
                    }
                };
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .filter((material, index, materials) =>
            materials.findIndex((candidate) => candidate.link.url === material.link.url) === index)
);

export const desiredClassroomState = (assignment) =>
    assignment?.status === 'published' ? 'PUBLISHED' : 'DRAFT';

export const buildCourseWorkPayload = ({ assignment, timeZone }) => {
    const payload = {
        title: clip(assignment.title, MAX_TITLE_LENGTH),
        description: buildDescription(assignment),
        workType: 'ASSIGNMENT',
        maxPoints: Number(assignment.maxMarks || 0),
        state: desiredClassroomState(assignment),
        materials: buildCourseWorkMaterials(assignment)
    };
    const due = toClassroomDue(assignment.dueDate, timeZone);
    if (due) {
        payload.dueDate = due.dueDate;
        payload.dueTime = due.dueTime;
    }
    return payload;
};

/**
 * Builds a patch for existing coursework. Classroom's patch API doesn't allow changing materials.
 * State only moves DRAFT -> PUBLISHED; it is never downgraded.
 * Due fields are included when set, or when a due date was previously synced and has now been removed.
 */
export const buildCourseWorkPatch = ({ assignment, timeZone, link }) => {
    const payload = {
        title: clip(assignment.title, MAX_TITLE_LENGTH),
        description: buildDescription(assignment),
        maxPoints: Number(assignment.maxMarks || 0)
    };
    const mask = ['title', 'description', 'maxPoints'];

    if (link?.syncState === 'draft' && desiredClassroomState(assignment) === 'PUBLISHED') {
        payload.state = 'PUBLISHED';
        mask.push('state');
    }

    const due = toClassroomDue(assignment.dueDate, timeZone);
    if (due) {
        payload.dueDate = due.dueDate;
        payload.dueTime = due.dueTime;
        mask.push('dueDate', 'dueTime');
    } else if (link?.dueDateSynced) {
        mask.push('dueDate', 'dueTime');
    }

    return { requestBody: payload, updateMask: mask.join(',') };
};

const classroomClient = (auth) => google.classroom({ version: 'v1', auth });

/** Lists active courses the connected account teaches. Returns only fields the UI needs. */
export const listTeacherCourses = async (auth) => {
    const classroom = classroomClient(auth);
    const courses = [];
    let pageToken;
    for (let page = 0; page < MAX_COURSE_PAGES; page += 1) {
        const { data } = await withRetry(
            () => classroom.courses.list({
                teacherId: 'me',
                courseStates: ['ACTIVE'],
                pageSize: 100,
                pageToken
            }),
            { idempotent: true }
        );
        (data.courses || []).forEach((course) => {
            courses.push({
                id: String(course.id),
                name: course.name || '',
                section: course.section || '',
                room: course.room || '',
                alternateLink: course.alternateLink || ''
            });
        });
        pageToken = data.nextPageToken;
        if (!pageToken) break;
    }
    return courses;
};

export const createCourseWork = async (auth, courseId, requestBody) => {
    const { data } = await withRetry(
        () => classroomClient(auth).courses.courseWork.create({ courseId, requestBody }),
        { idempotent: false }
    );
    return data;
};

export const patchCourseWork = async (auth, courseId, id, { requestBody, updateMask }) => {
    const { data } = await withRetry(
        () => classroomClient(auth).courses.courseWork.patch({ courseId, id, updateMask, requestBody }),
        { idempotent: true }
    );
    return data;
};
