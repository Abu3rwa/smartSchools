import { google } from 'googleapis';
import { toClassroomDue } from '../utils/classroomDueDate.js';
import { withRetry } from './classroomErrors.js';

const MAX_TITLE_LENGTH = 3000;
const MAX_DESCRIPTION_LENGTH = 30000;
const MAX_COURSE_PAGES = 5;

const clip = (value, max) => String(value || '').slice(0, max);

/**
 * Builds the coursework description. Links are placed in the description (not as Classroom
 * materials) because the patch endpoint cannot update materials, which would let edits drift.
 * Only external URLs are included; internal assessment/practice links stay in the app.
 */
export const buildDescription = (assignment) => {
    const parts = [];
    const instructions = String(assignment?.instructions || '').trim();
    if (instructions) parts.push(instructions);

    const links = (Array.isArray(assignment?.links) ? assignment.links : [])
        .filter((link) => link?.type === 'external_url' && /^https?:\/\//i.test(String(link?.url || '')));
    if (links.length > 0) {
        const lines = links.map((link) => (link.title ? `- ${link.title}: ${link.url}` : `- ${link.url}`));
        parts.push(['Links:', ...lines].join('\n'));
    }
    return clip(parts.join('\n\n'), MAX_DESCRIPTION_LENGTH);
};

export const desiredClassroomState = (assignment) =>
    assignment?.status === 'published' ? 'PUBLISHED' : 'DRAFT';

export const buildCourseWorkPayload = ({ assignment, timeZone }) => {
    const payload = {
        title: clip(assignment.title, MAX_TITLE_LENGTH),
        description: buildDescription(assignment),
        workType: 'ASSIGNMENT',
        maxPoints: Number(assignment.maxMarks || 0),
        state: desiredClassroomState(assignment)
    };
    const due = toClassroomDue(assignment.dueDate, timeZone);
    if (due) {
        payload.dueDate = due.dueDate;
        payload.dueTime = due.dueTime;
    }
    return payload;
};

/**
 * Builds a patch for existing coursework. State only moves DRAFT -> PUBLISHED; it is never downgraded.
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
