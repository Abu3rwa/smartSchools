import mongoose from 'mongoose';
import Assignment from '../models/Assignment.js';
import AssignmentClassroomLink from '../models/AssignmentClassroomLink.js';
import Class from '../models/Class.js';
import ClassroomCourseMapping from '../models/ClassroomCourseMapping.js';
import Teacher from '../models/Teacher.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { isTeacherAuthorizedForClassSubject } from '../helpers/teacherScoping.js';
import { isClassroomEnabledForSchool } from '../config/classroomConfig.js';
import { buildSignedState } from '../utils/classroomOAuthState.js';
import classroomOAuthService from '../services/googleClassroomOAuthService.js';
import { listTeacherCourses } from '../services/googleClassroomService.js';
import { ClassroomSyncError, normalizeGoogleError } from '../services/classroomErrors.js';
import { summarizeLink, syncAssignmentToClassroom } from '../services/classroomPublishService.js';
import logger from '../utils/logger.js';

const toId = (value) => (value == null ? '' : String(value));
const MAX_LINK_LOOKUP = 100;

const STATUS_BY_CODE = {
    IN_PROGRESS: 409,
    TEACHER_ONLY: 403,
    PERMISSION_DENIED: 403,
    RATE_LIMITED: 429,
    UNAVAILABLE: 502,
    UNKNOWN: 502,
    AUTH_REFRESH_FAILED: 502
};

// Client-side API interceptors typically treat 401 as an app-session expiry, so Google auth problems use 400.
const statusForCode = (code) => STATUS_BY_CODE[code] || 400;
const CLASSROOM_ROLES = new Set(['teacher', 'admin', 'department_principal']);

const resolveClassroomTeacher = async (req) => {
    if (!CLASSROOM_ROLES.has(req.user?.role)) return null;
    return Teacher.findOne({ user: req.user._id, school: req.schoolId });
};

const requireClassroomTeacher = async (req, res) => {
    if (await resolveClassroomTeacher(req)) return true;
    res.status(403).json({
        success: false,
        message: 'A teacher profile assigned to this school is required to manage Google Classroom.'
    });
    return false;
};

const sendError = (res, rawError) => {
    const error = rawError instanceof ClassroomSyncError ? rawError : normalizeGoogleError(rawError);
    return res.status(statusForCode(error.code)).json({
        success: false,
        code: error.code,
        message: error.message,
        retryable: error.retryable
    });
};

const canTeacherManageAssignment = async (req, assignment) => {
    const teacher = await resolveClassroomTeacher(req);
    if (!teacher) return false;
    if (toId(assignment.teacher) === toId(teacher._id)) return true;
    return isTeacherAuthorizedForClassSubject(teacher._id, toId(assignment.class), toId(assignment.subject));
};

export const getClassroomStatus = asyncHandler(async (req, res) => {
    const enabled = isClassroomEnabledForSchool(req.schoolId);
    const canManageClassroom = Boolean(await resolveClassroomTeacher(req));
    if (!enabled) {
        return res.json({
            success: true,
            data: { enabled: false, connected: false, canManageClassroom }
        });
    }

    const status = await classroomOAuthService.getTokenStatus(req.user._id);
    return res.json({ success: true, data: { enabled: true, canManageClassroom, ...status } });
});

export const getClassroomAuthUrl = asyncHandler(async (req, res) => {
    if (!(await requireClassroomTeacher(req, res))) return;
    const authUrl = classroomOAuthService.getAuthUrl(buildSignedState(toId(req.user._id)));
    return res.json({ success: true, authUrl });
});

export const disconnectClassroom = asyncHandler(async (req, res) => {
    if (!(await requireClassroomTeacher(req, res))) return;
    await classroomOAuthService.revokeTokens(req.user._id);
    return res.json({ success: true, message: 'Google Classroom disconnected' });
});

export const listClassroomCourses = asyncHandler(async (req, res) => {
    if (!(await requireClassroomTeacher(req, res))) return;
    try {
        const { auth } = await classroomOAuthService.getAuthorizedClient(req.user._id);
        const courses = await listTeacherCourses(auth);
        return res.json({ success: true, data: { courses } });
    } catch (error) {
        return sendError(res, error);
    }
});

export const listClassroomMappings = asyncHandler(async (req, res) => {
    if (!(await requireClassroomTeacher(req, res))) return;
    const query = { school: req.schoolId, mappedBy: req.user._id, isActive: true };
    if (req.query.classId && mongoose.isValidObjectId(req.query.classId)) {
        const classDoc = await Class.findOne({ _id: req.query.classId, school: req.schoolId })
            .select('academicYear')
            .lean();
        if (!classDoc) return res.json({ success: true, data: { items: [] } });
        query.class = req.query.classId;
        query.academicYear = classDoc.academicYear;
    }
    if (req.query.subjectId && mongoose.isValidObjectId(req.query.subjectId)) query.subject = req.query.subjectId;
    if (!query.academicYear && req.query.academicYear) query.academicYear = String(req.query.academicYear);

    const rows = await ClassroomCourseMapping.find(query)
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .lean();

    return res.json({
        success: true,
        data: {
            items: rows.map((row) => ({
                id: toId(row._id),
                classId: toId(row.class?._id || row.class),
                className: row.class?.name || '',
                subjectId: toId(row.subject?._id || row.subject),
                subjectName: row.subject?.name || '',
                academicYear: row.academicYear,
                courseId: row.courseId,
                courseName: row.courseName,
                courseSection: row.courseSection,
                googleEmail: row.googleEmail
            }))
        }
    });
});

export const upsertClassroomMapping = asyncHandler(async (req, res) => {
    if (!(await requireClassroomTeacher(req, res))) return;
    const classId = toId(req.body?.classId);
    const subjectId = toId(req.body?.subjectId);
    const courseId = toId(req.body?.courseId).trim();
    if (!mongoose.isValidObjectId(classId) || !mongoose.isValidObjectId(subjectId) || !courseId) {
        return res.status(400).json({ success: false, message: 'classId, subjectId and courseId are required' });
    }

    // The selected class is authoritative for its academic year; the global year
    // header can differ when a teacher is viewing a retained class record.
    const classDoc = await Class.findOne({ _id: classId, school: req.schoolId });
    if (!classDoc) {
        return res.status(400).json({ success: false, message: 'Class not found for the current school' });
    }
    const academicYear = classDoc.academicYear;
    if (!(classDoc.subjects || []).some((entry) => toId(entry.subject) === subjectId)) {
        return res.status(400).json({ success: false, message: 'Subject is not assigned to this class' });
    }

    const teacher = await resolveClassroomTeacher(req);
    if (!teacher || !(await isTeacherAuthorizedForClassSubject(teacher._id, classId, subjectId))) {
        return res.status(403).json({ success: false, message: 'You are not authorized for this class and subject' });
    }

    try {
        // The course must be one the connected Google account teaches; an ID alone is not proof of access.
        const { user, auth } = await classroomOAuthService.getAuthorizedClient(req.user._id);
        const courses = await listTeacherCourses(auth);
        const course = courses.find((item) => item.id === courseId);
        if (!course) {
            return res.status(400).json({
                success: false,
                message: 'That course was not found among the active Classroom courses you teach'
            });
        }

        const mapping = await ClassroomCourseMapping.findOneAndUpdate(
            { school: req.schoolId, class: classId, subject: subjectId, academicYear, mappedBy: req.user._id },
            {
                $set: {
                    courseId: course.id,
                    courseName: course.name,
                    courseSection: course.section,
                    googleEmail: user.googleClassroomTokens?.email || '',
                    isActive: true
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.json({
            success: true,
            data: {
                mapping: {
                    id: toId(mapping._id),
                    classId,
                    subjectId,
                    academicYear,
                    courseId: mapping.courseId,
                    courseName: mapping.courseName,
                    courseSection: mapping.courseSection,
                    googleEmail: mapping.googleEmail
                }
            }
        });
    } catch (error) {
        return sendError(res, error);
    }
});

export const deleteClassroomMapping = asyncHandler(async (req, res) => {
    if (!(await requireClassroomTeacher(req, res))) return;
    const result = await ClassroomCourseMapping.findOneAndDelete({
        _id: req.params.id,
        school: req.schoolId,
        mappedBy: req.user._id
    });
    if (!result) return res.status(404).json({ success: false, message: 'Mapping not found' });
    return res.json({ success: true });
});

export const publishAssignmentToClassroom = asyncHandler(async (req, res) => {
    if (!(await requireClassroomTeacher(req, res))) return;
    const assignment = await Assignment.findOne({ _id: req.params.id, school: req.schoolId });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (!(await canTeacherManageAssignment(req, assignment))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this assignment' });
    }
    if (!['draft', 'published'].includes(assignment.status)) {
        return res.status(400).json({
            success: false,
            message: 'Only draft or published assignments can be posted to Google Classroom'
        });
    }

    const result = await syncAssignmentToClassroom({ assignment, actor: req.user, createIfMissing: true });
    if (result.ok) return res.json({ success: true, data: { classroom: result.link } });

    logger.info('Classroom publish did not complete', { assignmentId: toId(assignment._id), code: result.code });
    return res.status(statusForCode(result.code)).json({
        success: false,
        code: result.code,
        message: result.message,
        retryable: Boolean(result.retryable),
        data: result.link ? { classroom: result.link } : undefined
    });
});

export const getClassroomLinks = asyncHandler(async (req, res) => {
    const ids = String(req.query.assignmentIds || '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => mongoose.isValidObjectId(value))
        .slice(0, MAX_LINK_LOOKUP);
    if (ids.length === 0) return res.json({ success: true, data: { items: {} } });

    const query = { school: req.schoolId, assignment: { $in: ids } };
    // Teachers only see sync status for the Classroom posts they created.
    if (req.user.role === 'teacher') query.createdBy = req.user._id;

    const links = await AssignmentClassroomLink.find(query);
    const items = {};
    links.forEach((link) => {
        items[toId(link.assignment)] = summarizeLink(link);
    });
    return res.json({ success: true, data: { items } });
});
