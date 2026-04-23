import Assignment from '../models/Assignment.js';
import AssignmentType from '../models/AssignmentType.js';
import Class from '../models/Class.js';
import Grade from '../models/Grade.js';
import Notification from '../models/Notification.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import notificationService from '../services/notificationService.js';
import { uploadPrivateFile, getSignedUrl, deleteFile } from '../services/firebaseStorageService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import {
    getTeacherClassIds,
    isTeacherAuthorizedForClassSubject,
    resolveTeacherProfile
} from '../helpers/teacherScoping.js';
import { ensureDefaultAssignmentTypes } from './assignmentTypeController.js';
import { validateGradeLessonPlanLinks } from '../helpers/gradeLessonPlanLinks.js';
import { syncObjectivesForGrade } from '../jobs/academicExcellenceSyncJob.js';
import { generateAssignmentReminder } from '../helpers/assignmentReminderAi.js';
import logger from '../utils/logger.js';

const toId = (value) => (value == null ? '' : String(value));

/** Safely coerce a value that may be a JSON-stringified array (from FormData) into a real array. */
const toArray = (v, fallback = []) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
        try { const parsed = JSON.parse(v); if (Array.isArray(parsed)) return parsed; } catch { /* ignore */ }
    }
    return fallback;
};

const parseBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
};

const NOTIFY_AUDIENCES = new Set(['students', 'parents', 'both']);

const parseNotifyAudience = (value, fallback = 'both') => {
    const normalized = String(value || '').trim().toLowerCase();
    if (NOTIFY_AUDIENCES.has(normalized)) return normalized;

    const fallbackNormalized = String(fallback || '').trim().toLowerCase();
    if (NOTIFY_AUDIENCES.has(fallbackNormalized)) return fallbackNormalized;

    return 'both';
};

const parseDate = (value, fallback = null) => {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
};

const normalizeScope = (value, studentIds = []) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'selected_students' || normalized === 'selected') {
        return studentIds.length > 0 ? 'selected_students' : 'class';
    }
    return 'class';
};

const parsePositiveNumber = (value, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
};

const gradeTypeCategoryFromAssignmentKey = (key = '') => {
    const normalized = String(key || '').trim().toLowerCase();
    switch (normalized) {
        case 'homework':
            return { gradeType: 'homework', category: 'homework' };
        case 'classwork':
            return { gradeType: 'classwork', category: 'classwork' };
        case 'quiz':
            return { gradeType: 'quiz', category: 'quiz' };
        case 'project':
            return { gradeType: 'project', category: 'project' };
        case 'participation':
            return { gradeType: 'participation', category: 'participation' };
        case 'test':
            return { gradeType: 'monthly_test', category: 'test' };
        case 'exam':
            return { gradeType: 'semester_exam', category: 'exam' };
        default:
            return { gradeType: 'other', category: 'other' };
    }
};

const mapAssignmentSummary = (assignment) => {
    const linkedLessonPlans = Array.isArray(assignment.lessonPlanIds)
        ? assignment.lessonPlanIds
            .map((lesson) => {
                const id = toId(lesson?._id || lesson);
                if (!id) return null;
                return {
                    id,
                    title: lesson?.title || '',
                    date: lesson?.date || null
                };
            })
            .filter(Boolean)
        : [];

    return {
        id: assignment._id,
        title: assignment.title || '',
        instructions: assignment.instructions || '',
        assignmentType: assignment.assignmentType
            ? {
                id: toId(assignment.assignmentType?._id || assignment.assignmentType),
                key: assignment.assignmentType?.key || assignment.assignmentTypeKey || '',
                name: assignment.assignmentType?.name || assignment.assignmentTypeName || ''
            }
            : {
                id: '',
                key: assignment.assignmentTypeKey || '',
                name: assignment.assignmentTypeName || ''
            },
        assignedDate: assignment.assignedDate || null,
        dueDate: assignment.dueDate || null,
        status: assignment.status || 'draft',
        scope: assignment.scope || 'class',
        studentIds: Array.isArray(assignment.studentIds)
            ? assignment.studentIds.map((studentId) => toId(studentId))
            : [],
        lessonPlanIds: linkedLessonPlans.map((lesson) => lesson.id),
        lessonPlans: linkedLessonPlans,
        links: Array.isArray(assignment.links)
            ? assignment.links.map((link) => ({
                _id: toId(link._id),
                type: link.type || 'external_url',
                title: link.title || '',
                url: link.url || '',
                refId: link.refId ? toId(link.refId) : null,
                classId: link.classId ? toId(link.classId) : null
            }))
            : [],
        attachments: Array.isArray(assignment.attachments)
            ? assignment.attachments.map((att) => ({
                _id: toId(att._id),
                fileName: att.fileName || '',
                mimeType: att.mimeType || '',
                size: att.size || 0,
                storageKey: att.storageKey || '',
                url: att.url || ''
            }))
            : [],
        maxMarks: Number(assignment.maxMarks || 10),
        allowLateSubmission: assignment.allowLateSubmission === true,
        notifyOnAssign: assignment.notifyOnAssign !== false,
        notifyAudience: parseNotifyAudience(assignment.notifyAudience, 'both'),
        notifyOnGrade: assignment.notifyOnGrade !== false,
        publishedAt: assignment.publishedAt || null,
        academicYear: assignment.academicYear || '',
        class: assignment.class
            ? {
                id: toId(assignment.class?._id || assignment.class),
                name: assignment.class?.name || '',
                grade: assignment.class?.grade ?? null,
                section: assignment.class?.section || ''
            }
            : null,
        subject: assignment.subject
            ? {
                id: toId(assignment.subject?._id || assignment.subject),
                name: assignment.subject?.name || '',
                code: assignment.subject?.code || ''
            }
            : null
    };
};

const resolveTargetStudentsForAssignment = async (assignment) => {
    const query = {
        school: assignment.school,
        currentClass: assignment.class,
        status: 'active'
    };
    if (assignment.scope === 'selected_students') {
        const ids = Array.isArray(assignment.studentIds) ? assignment.studentIds : [];
        query._id = { $in: ids };
    }
    return Student.find(query)
        .select('_id firstName lastName studentId parentInfo email')
        .lean({ virtuals: true });
};

const verifyTeacherCanAccessAssignment = async (req, assignment) => {
    if (req.user.role !== 'teacher') return true;
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) return false;

    if (toId(assignment.teacher) === toId(teacher._id)) return true;
    return isTeacherAuthorizedForClassSubject(
        teacher._id,
        toId(assignment.class),
        toId(assignment.subject)
    );
};

const resolveAssignmentType = async ({ schoolId, assignmentTypeId, assignmentTypeKey }) => {
    if (assignmentTypeId) {
        return AssignmentType.findOne({
            _id: assignmentTypeId,
            school: schoolId,
            isActive: true
        });
    }
    if (assignmentTypeKey) {
        return AssignmentType.findOne({
            school: schoolId,
            key: String(assignmentTypeKey).trim().toLowerCase(),
            isActive: true
        });
    }
    return null;
};

const sendAssignPostedNotifications = async ({ assignment, students, createdBy, audience = 'both' }) => {
    if (!Array.isArray(students) || students.length === 0) return;

    const resolvedAudience = parseNotifyAudience(audience, parseNotifyAudience(assignment?.notifyAudience, 'both'));
    const sendToParents = resolvedAudience === 'parents' || resolvedAudience === 'both';
    const sendToStudents = resolvedAudience === 'students' || resolvedAudience === 'both';
    if (!sendToParents && !sendToStudents) return;

    await Promise.allSettled(
        students.flatMap((student) => {
            const notifications = [];
            if (sendToParents) {
                notifications.push(
                    notificationService.sendAssignmentPostedNotification({
                        studentId: student._id,
                        assignment,
                        createdBy
                    })
                );
            }
            if (sendToStudents) {
                notifications.push(
                    notificationService.sendStudentAssignmentPostedNotification({
                        studentId: student._id,
                        assignment,
                        createdBy
                    })
                );
            }
            return notifications;
        })
    );
};

const HTTP_URL_RE = /^https?:\/\/.+/i;

const validateLinks = (rawLinks) => {
    if (!Array.isArray(rawLinks) || rawLinks.length === 0) return [];
    const MAX_LINKS = 10;
    const validTypes = new Set(['external_url', 'assessment', 'practice_objective']);
    const validated = [];
    for (const link of rawLinks.slice(0, MAX_LINKS)) {
        const type = String(link?.type || '').trim().toLowerCase();
        if (!validTypes.has(type)) continue;
        const title = String(link?.title || '').trim().slice(0, 200);
        if (type === 'external_url') {
            const url = String(link?.url || '').trim();
            if (!HTTP_URL_RE.test(url)) continue;
            validated.push({ type, title, url, refId: null, classId: null });
        } else {
            const refId = toId(link?.refId);
            if (!refId) continue;
            validated.push({
                type,
                title,
                url: '',
                refId,
                classId: link?.classId ? toId(link.classId) : null
            });
        }
    }
    return validated;
};

const uploadAttachmentFiles = async (files, schoolId, assignmentId) => {
    if (!Array.isArray(files) || files.length === 0) return [];
    const results = [];
    for (const file of files) {
        const ext = file.originalname ? file.originalname.split('.').pop() : 'bin';
        const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const destinationPath = `schools/${schoolId}/assignments/${assignmentId}/${safeName}`;
        const { fileRef } = await uploadPrivateFile(file.buffer, file.mimetype, destinationPath);
        results.push({
            fileName: file.originalname || safeName,
            mimeType: file.mimetype || 'application/octet-stream',
            size: file.size || file.buffer.length,
            storageKey: fileRef,
            url: ''
        });
    }
    return results;
};

const deleteAttachmentFiles = async (attachments) => {
    if (!Array.isArray(attachments) || attachments.length === 0) return;
    await Promise.allSettled(
        attachments.map((att) => deleteFile(att.storageKey || att.url))
    );
};

const sendAssignGradedNotifications = async ({ assignment, gradedRows, createdBy }) => {
    if (!Array.isArray(gradedRows) || gradedRows.length === 0) return;

    // Deduplicate by studentId — keep only the last entry per student
    const uniqueByStudent = new Map();
    for (const row of gradedRows) {
        const sid = toId(row.studentId);
        if (sid) uniqueByStudent.set(sid, row);
    }
    const deduplicatedRows = [...uniqueByStudent.values()];

    // Skip students who already received a graded notification for this assignment
    // within the last 2 minutes (guards against rapid double-submissions)
    const recentCutoff = new Date(Date.now() - 2 * 60 * 1000);
    const recentNotifications = await Notification.find({
        type: 'assignment_graded',
        'metadata.assignmentId': String(assignment._id),
        student: { $in: deduplicatedRows.map((r) => r.studentId) },
        createdAt: { $gte: recentCutoff }
    }).select('student').lean();
    const recentlyNotifiedStudents = new Set(
        recentNotifications.map((n) => toId(n.student))
    );

    const rowsToNotify = deduplicatedRows.filter(
        (row) => !recentlyNotifiedStudents.has(toId(row.studentId))
    );
    if (rowsToNotify.length === 0) return;

    await Promise.allSettled(
        rowsToNotify.flatMap((row) => [
            notificationService.sendAssignmentGradedNotification({
                studentId: row.studentId,
                assignment,
                grade: row.grade,
                createdBy
            }),
            notificationService.sendStudentAssignmentGradedNotification({
                studentId: row.studentId,
                assignment,
                grade: row.grade,
                createdBy
            }),
        ])
    );
};

export const getAssignments = asyncHandler(async (req, res) => {
    await ensureDefaultAssignmentTypes(req.schoolId, req.user._id);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const allowYearOverride = req.user.role === 'admin' || req.user.role === 'super_admin';
    const academicYear = resolveAcademicYearForRequest(req, req.query.academicYear, {
        allowOverride: allowYearOverride
    });

    const query = {
        school: req.schoolId,
        academicYear
    };

    const classId = toId(req.query.classId || req.query.class);
    const subjectId = toId(req.query.subjectId || req.query.subject);
    const status = String(req.query.status || '').trim().toLowerCase();
    const assignmentTypeKey = String(req.query.assignmentTypeKey || req.query.type || '').trim().toLowerCase();

    if (classId) query.class = classId;
    if (subjectId) query.subject = subjectId;
    if (status && ['draft', 'published', 'closed', 'archived'].includes(status)) query.status = status;
    if (assignmentTypeKey) query.assignmentTypeKey = assignmentTypeKey;

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        const allowedClassIds = await getTeacherClassIds(teacher._id);
        const allowedSet = new Set(allowedClassIds.map((id) => toId(id)));
        if (classId && !allowedSet.has(classId)) {
            return res.json({
                success: true,
                data: { items: [], pagination: { page, limit, total: 0, totalPages: 0 } }
            });
        }
        if (!classId) query.class = { $in: [...allowedSet] };
    }

    const [rows, total] = await Promise.all([
        Assignment.find(query)
            .populate('assignmentType', 'key name')
            .populate('class', 'name grade section')
            .populate('subject', 'name code')
            .populate('lessonPlanIds', 'title date')
            .sort({ assignedDate: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Assignment.countDocuments(query)
    ]);

    res.json({
        success: true,
        data: {
            items: rows.map(mapAssignmentSummary),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }
    });
});

export const getMyAssignmentsForStudent = asyncHandler(async (req, res) => {
    const academicYear = resolveAcademicYearForRequest(req);
    const student = await Student.findOne({
        user: req.user._id,
        school: req.schoolId,
        academicYear,
        status: 'active'
    }).select('_id currentClass academicYear');

    if (!student) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const classId = toId(student.currentClass);
    if (!classId) {
        return res.json({ success: true, data: { items: [] } });
    }

    const rows = await Assignment.find({
        school: req.schoolId,
        academicYear,
        class: classId,
        status: { $ne: 'archived' },
        $or: [
            { scope: 'class' },
            { scope: 'selected_students', studentIds: student._id },
            { studentIds: student._id }
        ]
    })
        .populate('assignmentType', 'key name')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('lessonPlanIds', 'title date')
        .sort({ dueDate: 1, assignedDate: -1, createdAt: -1 })
        .lean();

    res.json({
        success: true,
        data: {
            items: rows.map(mapAssignmentSummary)
        }
    });
});

export const createAssignment = asyncHandler(async (req, res) => {
    await ensureDefaultAssignmentTypes(req.schoolId, req.user._id);

    const body = req.body || {};
    const classId = toId(body.classId || body.class);
    const subjectId = toId(body.subjectId || body.subject);
    const assignmentTypeId = toId(body.assignmentTypeId || body.assignmentType);
    const assignmentTypeKey = String(body.assignmentTypeKey || '').trim().toLowerCase();
    const title = String(body.title || '').trim();
    const dueDate = parseDate(body.dueDate, null);
    if (!classId || !subjectId || !title || (!assignmentTypeId && !assignmentTypeKey)) {
        return res.status(400).json({
            success: false,
            message: 'classId, subjectId, assignmentTypeId/assignmentTypeKey, and title are required'
        });
    }
    if (body.dueDate !== undefined && body.dueDate !== null && !dueDate) {
        return res.status(400).json({ success: false, message: 'Invalid dueDate' });
    }

    const allowYearOverride = req.user.role === 'admin' || req.user.role === 'super_admin';
    const academicYear = resolveAcademicYearForRequest(req, body.academicYear, {
        allowOverride: allowYearOverride
    });

    const classDoc = await Class.findOne({ _id: classId, school: req.schoolId, academicYear });
    if (!classDoc) {
        return res.status(400).json({
            success: false,
            message: 'Selected class not found for current school and academic year'
        });
    }
    const subjectExistsInClass = (classDoc.subjects || []).some(
        (entry) => toId(entry.subject) === subjectId
    );
    if (!subjectExistsInClass) {
        return res.status(400).json({
            success: false,
            message: 'Selected subject is not assigned to the selected class'
        });
    }

    const type = await resolveAssignmentType({
        schoolId: req.schoolId,
        assignmentTypeId,
        assignmentTypeKey
    });
    if (!type) {
        return res.status(400).json({
            success: false,
            message: 'Assignment type not found or inactive'
        });
    }

    let teacherId = toId(body.teacherId);
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        const authorized = await isTeacherAuthorizedForClassSubject(teacher._id, classId, subjectId);
        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized for this class and subject'
            });
        }
        teacherId = toId(teacher._id);
    } else if (!teacherId) {
        const subjectTeacherEntry = (classDoc.subjects || []).find(
            (entry) => toId(entry.subject) === subjectId && entry.teacher
        );
        teacherId = toId(subjectTeacherEntry?.teacher || classDoc.classTeacher);
    }
    if (!teacherId) {
        return res.status(400).json({ success: false, message: 'teacherId could not be resolved' });
    }
    if (req.user.role !== 'teacher') {
        const teacher = await Teacher.findOne({ _id: teacherId, school: req.schoolId, isActive: true })
            .select('_id')
            .lean();
        if (!teacher) return res.status(400).json({ success: false, message: 'Provided teacherId is invalid for this school' });

        const authorized = await isTeacherAuthorizedForClassSubject(teacher._id, classId, subjectId);
        if (!authorized) {
            return res.status(400).json({
                success: false,
                message: 'Resolved/provided teacher is not assigned to this class and subject'
            });
        }
    }

    const requestedStudentIds = toArray(body.studentIds);
    const scope = normalizeScope(body.scope, requestedStudentIds);
    const validSelectedStudentIds = scope === 'selected_students'
        ? await Student.find({
            school: req.schoolId,
            _id: { $in: requestedStudentIds },
            currentClass: classId,
            academicYear,
            status: 'active'
        }).distinct('_id')
        : [];
    if (scope === 'selected_students' && validSelectedStudentIds.length !== requestedStudentIds.length) {
        return res.status(400).json({
            success: false,
            message: 'One or more selected students are invalid for this class and academic year'
        });
    }

    const normalizedLessonPlanIds = await validateGradeLessonPlanLinks({
        lessonPlanIds: toArray(body.lessonPlanIds),
        schoolId: req.schoolId,
        classId,
        subjectId,
        user: req.user
    });

    const validatedLinks = validateLinks(
        typeof body.links === 'string' ? JSON.parse(body.links || '[]') : body.links
    );

    const publishNow = parseBoolean(body.publishNow, false) || String(body.status || '').trim().toLowerCase() === 'published';
    const notifyAudience = parseNotifyAudience(body.notifyAudience, 'both');
    const assignment = await Assignment.create({
        school: req.schoolId,
        academicYear,
        class: classId,
        subject: subjectId,
        teacher: teacherId,
        assignmentType: type._id,
        assignmentTypeKey: type.key,
        assignmentTypeName: type.name,
        title,
        instructions: String(body.instructions || '').trim(),
        assignedDate: parseDate(body.assignedDate, new Date()),
        dueDate,
        status: publishNow ? 'published' : 'draft',
        scope,
        studentIds: scope === 'selected_students' ? validSelectedStudentIds : [],
        lessonPlanIds: normalizedLessonPlanIds ?? [],
        links: validatedLinks,
        attachments: [],
        maxMarks: parsePositiveNumber(body.maxMarks, Number(type.defaults?.maxMarks || 10)),
        allowLateSubmission: body.allowLateSubmission === undefined
            ? type.defaults?.allowLateSubmission === true
            : parseBoolean(body.allowLateSubmission, false),
        notifyOnAssign: body.notifyOnAssign === undefined
            ? type.defaults?.notifyOnAssign !== false
            : parseBoolean(body.notifyOnAssign, true),
        notifyAudience,
        notifyOnGrade: body.notifyOnGrade === undefined
            ? type.defaults?.notifyOnGrade !== false
            : parseBoolean(body.notifyOnGrade, true),
        publishedAt: publishNow ? new Date() : null,
        publishedBy: publishNow ? req.user._id : null,
        metadata: body.metadata ?? null
    });

    if (publishNow && assignment.notifyOnAssign !== false) {
        const students = await resolveTargetStudentsForAssignment(assignment);
        await sendAssignPostedNotifications({
            assignment,
            students,
            createdBy: req.user._id,
            audience: assignment.notifyAudience
        });
    }

    // Upload attachment files after assignment creation so we have the ID for storage paths
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length > 0) {
        const uploadedAttachments = await uploadAttachmentFiles(files, req.schoolId, assignment._id);
        assignment.attachments = uploadedAttachments;
        await assignment.save();
    }

    const populated = await Assignment.findById(assignment._id)
        .populate('assignmentType', 'key name')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('lessonPlanIds', 'title date')
        .lean();

    res.status(201).json({
        success: true,
        data: { assignment: mapAssignmentSummary(populated) }
    });
});

export const publishAssignment = asyncHandler(async (req, res) => {
    const assignment = await Assignment.findOne({ _id: req.params.id, school: req.schoolId });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) return res.status(403).json({ success: false, message: 'Not authorized to publish this assignment' });
    if (assignment.status === 'archived') {
        return res.status(400).json({ success: false, message: 'Archived assignments cannot be published' });
    }

    assignment.status = 'published';
    assignment.notifyOnAssign = req.body?.notifyOnAssign === undefined
        ? assignment.notifyOnAssign !== false
        : parseBoolean(req.body.notifyOnAssign, true);
    assignment.notifyAudience = req.body?.notifyAudience === undefined
        ? parseNotifyAudience(assignment.notifyAudience, 'both')
        : parseNotifyAudience(req.body.notifyAudience, assignment.notifyAudience);
    assignment.publishedAt = new Date();
    assignment.publishedBy = req.user._id;
    await assignment.save();

    if (assignment.notifyOnAssign !== false) {
        const students = await resolveTargetStudentsForAssignment(assignment);
        await sendAssignPostedNotifications({
            assignment,
            students,
            createdBy: req.user._id,
            audience: assignment.notifyAudience
        });
    }

    res.json({
        success: true,
        data: { assignment: mapAssignmentSummary(assignment) }
    });
});

/* ── Send reminder to parents ── */
export const sendAssignmentReminder = asyncHandler(async (req, res) => {
    const assignment = await Assignment.findOne({ _id: req.params.id, school: req.schoolId });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    if (assignment.status !== 'published') {
        return res.status(400).json({ success: false, message: 'Can only send reminders for published assignments' });
    }

    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) return res.status(403).json({ success: false, message: 'Not authorized' });

    const audience = ['students', 'parents', 'both'].includes(req.body?.audience) ? req.body.audience : 'both';
    const students = await resolveTargetStudentsForAssignment(assignment);
    if (students.length === 0) {
        return res.status(400).json({ success: false, message: 'No students found for this assignment' });
    }

    const sendToParents = audience === 'parents' || audience === 'both';
    const sendToStudents = audience === 'students' || audience === 'both';

    // Generate one reminder per student (personalized with name) and send to selected audience
    const results = await Promise.allSettled(
        students.map(async (student) => {
            try {
                const { subject, body } = generateAssignmentReminder({
                    assignment,
                    studentName: student.fullName || 'Student',
                });
                const promises = [];
                if (sendToParents) {
                    promises.push(notificationService.sendAssignmentReminderNotification({
                        studentId: student._id,
                        assignment,
                        subject,
                        reminderText: body,
                        createdBy: req.user._id,
                    }));
                }
                if (sendToStudents) {
                    promises.push(notificationService.sendStudentAssignmentReminderNotification({
                        studentId: student._id,
                        assignment,
                        subject,
                        reminderText: body,
                        createdBy: req.user._id,
                    }));
                }
                return Promise.all(promises);
            } catch (err) {
                logger.error('assignment_reminder_student_failed', {
                    studentId: String(student._id),
                    assignmentId: String(assignment._id),
                    error: err?.message || String(err),
                });
                throw err;
            }
        })
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
        logger.error('assignment_reminders_summary', {
            assignmentId: String(assignment._id),
            total: students.length,
            sent,
            failed: failed.length,
            reasons: failed.map((r) => r.reason?.message || String(r.reason)).slice(0, 5),
        });
    }
    res.json({ success: true, data: { studentCount: students.length, remindersSent: sent, audience } });
});

export const getAssignmentGradebook = asyncHandler(async (req, res) => {
    const assignment = await Assignment.findOne({ _id: req.params.id, school: req.schoolId })
        .populate('assignmentType', 'key name')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('lessonPlanIds', 'title date')
        .lean();
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) return res.status(403).json({ success: false, message: 'Not authorized to view this assignment' });

    const students = await resolveTargetStudentsForAssignment(assignment);
    const grades = await Grade.find({
        school: req.schoolId,
        assignment: assignment._id,
        student: { $in: students.map((student) => student._id) }
    })
        .select('_id student marks maxMarks remarks notes updatedAt')
        .lean();

    const gradeMap = new Map(grades.map((grade) => [toId(grade.student), grade]));
    res.json({
        success: true,
        data: {
            assignment: mapAssignmentSummary(assignment),
            rows: students.map((student) => ({
                student: {
                    id: toId(student._id),
                    studentId: student.studentId || '',
                    firstName: student.firstName || '',
                    lastName: student.lastName || '',
                    fullName: `${student.firstName || ''} ${student.lastName || ''}`.trim()
                },
                grade: gradeMap.get(toId(student._id)) || null
            }))
        }
    });
});

export const gradeAssignment = asyncHandler(async (req, res) => {
    const assignment = await Assignment.findOne({ _id: req.params.id, school: req.schoolId });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) return res.status(403).json({ success: false, message: 'Not authorized to grade this assignment' });
    if (!['published', 'closed'].includes(String(assignment.status || ''))) {
        return res.status(400).json({
            success: false,
            message: 'Assignment must be published or closed before grading'
        });
    }

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (rows.length === 0) return res.status(400).json({ success: false, message: 'rows must be a non-empty array' });

    const students = await resolveTargetStudentsForAssignment(assignment);
    const eligibleStudentIds = new Set(students.map((student) => toId(student._id)));
    const gradingDate = parseDate(req.body?.gradingDate, new Date());
    if (!gradingDate) return res.status(400).json({ success: false, message: 'Invalid gradingDate' });

    const month = gradingDate.getUTCMonth() + 1;
    const semester = (month >= 8 && month <= 12) ? 1 : 2;
    const typed = gradeTypeCategoryFromAssignmentKey(assignment.assignmentTypeKey);
    const teacherProfile = req.user.role === 'teacher' ? await resolveTeacherProfile(req) : null;
    const gradingTeacherId = teacherProfile?._id || assignment.teacher || req.user._id;
    const normalizedLessonPlanIds = await validateGradeLessonPlanLinks({
        lessonPlanIds: toArray(req.body?.lessonPlanIds, assignment.lessonPlanIds ?? []),
        schoolId: req.schoolId,
        classId: assignment.class,
        subjectId: assignment.subject,
        user: req.user
    });

    const gradedRows = [];
    for (const row of rows) {
        const studentId = String(row?.studentId || row?.student || '').trim();
        if (!studentId || !eligibleStudentIds.has(studentId)) {
            return res.status(400).json({ success: false, message: `Invalid student in grading rows: ${studentId}` });
        }
        const marks = Number(row.marks);
        const maxMarks = row.maxMarks === undefined ? Number(assignment.maxMarks || 10) : Number(row.maxMarks);
        if (!Number.isFinite(marks) || marks < 0 || !Number.isFinite(maxMarks) || maxMarks <= 0 || marks > maxMarks) {
            return res.status(400).json({
                success: false,
                message: `Invalid marks/maxMarks for student ${studentId}`
            });
        }

        const grade = await Grade.findOneAndUpdate(
            {
                school: req.schoolId,
                assignment: assignment._id,
                student: studentId
            },
            {
                $set: {
                    marks,
                    maxMarks,
                    date: gradingDate,
                    month,
                    semester,
                    title: assignment.title || assignment.assignmentTypeName || 'Assignment',
                    description: assignment.instructions || '',
                    category: typed.category,
                    notes: String(row.notes || '').trim(),
                    remarks: String(row.remarks || '').trim(),
                    subject: assignment.subject,
                    class: assignment.class,
                    teacher: gradingTeacherId,
                    academicYear: assignment.academicYear,
                    gradeType: typed.gradeType,
                    assignment: assignment._id,
                    gradingSource: 'manual',
                    lessonPlanIds: normalizedLessonPlanIds ?? []
                },
                $setOnInsert: {
                    school: req.schoolId,
                    student: studentId
                }
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                runValidators: true
            }
        );

        gradedRows.push({ studentId, grade });
    }

    const shouldNotifyParents = assignment.notifyOnGrade !== false
        && (req.body?.sendNotifications === undefined
            ? true
            : parseBoolean(req.body.sendNotifications, true));
    if (shouldNotifyParents) {
        await sendAssignGradedNotifications({
            assignment,
            gradedRows,
            createdBy: req.user._id
        });
    }

    const seenStudentIds = new Set();
    for (const row of gradedRows) {
        const studentId = toId(row.studentId);
        if (!studentId || seenStudentIds.has(studentId)) continue;
        seenStudentIds.add(studentId);

        syncObjectivesForGrade({
            schoolId: req.schoolId,
            studentId: row.studentId,
            subjectId: assignment.subject,
            classId: assignment.class,
            academicYear: assignment.academicYear
        }).catch(() => {});
    }

    res.json({
        success: true,
        data: {
            assignmentId: assignment._id,
            gradedCount: gradedRows.length
        }
    });
});

export const updateAssignment = asyncHandler(async (req, res) => {
    await ensureDefaultAssignmentTypes(req.schoolId, req.user._id);

    const assignment = await Assignment.findOne({ _id: req.params.id, school: req.schoolId });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) return res.status(403).json({ success: false, message: 'Not authorized to update this assignment' });

    const body = req.body || {};
    const allowYearOverride = req.user.role === 'admin' || req.user.role === 'super_admin';
    const academicYear = resolveAcademicYearForRequest(req, body.academicYear || assignment.academicYear, {
        allowOverride: allowYearOverride
    });

    const classId = toId(body.classId || body.class || assignment.class);
    const subjectId = toId(body.subjectId || body.subject || assignment.subject);
    const title = body.title === undefined
        ? assignment.title
        : String(body.title || '').trim();
    if (!classId || !subjectId || !title) {
        return res.status(400).json({
            success: false,
            message: 'classId, subjectId, and title are required'
        });
    }

    const classDoc = await Class.findOne({ _id: classId, school: req.schoolId, academicYear });
    if (!classDoc) {
        return res.status(400).json({
            success: false,
            message: 'Selected class not found for current school and academic year'
        });
    }

    const subjectExistsInClass = (classDoc.subjects || []).some(
        (entry) => toId(entry.subject) === subjectId
    );
    if (!subjectExistsInClass) {
        return res.status(400).json({
            success: false,
            message: 'Selected subject is not assigned to the selected class'
        });
    }

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        }
        const authorized = await isTeacherAuthorizedForClassSubject(teacher._id, classId, subjectId);
        if (!authorized) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized for this class and subject'
            });
        }
    }

    let type = null;
    const assignmentTypeId = toId(body.assignmentTypeId || body.assignmentType);
    const assignmentTypeKey = String(body.assignmentTypeKey || '').trim().toLowerCase();
    if (assignmentTypeId || assignmentTypeKey) {
        type = await resolveAssignmentType({
            schoolId: req.schoolId,
            assignmentTypeId,
            assignmentTypeKey
        });
        if (!type) {
            return res.status(400).json({
                success: false,
                message: 'Assignment type not found or inactive'
            });
        }
    }

    const assignedDate = body.assignedDate === undefined
        ? assignment.assignedDate
        : parseDate(body.assignedDate, null);
    const dueDate = body.dueDate === undefined
        ? assignment.dueDate
        : parseDate(body.dueDate, null);
    if (body.assignedDate !== undefined && !assignedDate) {
        return res.status(400).json({ success: false, message: 'Invalid assignedDate' });
    }
    if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== '' && !dueDate) {
        return res.status(400).json({ success: false, message: 'Invalid dueDate' });
    }

    const requestedStudentIds = toArray(body.studentIds,
        Array.isArray(assignment.studentIds) ? assignment.studentIds : []
    );
    const scope = body.scope === undefined
        ? normalizeScope(assignment.scope, requestedStudentIds)
        : normalizeScope(body.scope, requestedStudentIds);

    const validSelectedStudentIds = scope === 'selected_students'
        ? await Student.find({
            school: req.schoolId,
            _id: { $in: requestedStudentIds },
            currentClass: classId,
            academicYear,
            status: 'active'
        }).distinct('_id')
        : [];
    if (scope === 'selected_students' && validSelectedStudentIds.length !== requestedStudentIds.length) {
        return res.status(400).json({
            success: false,
            message: 'One or more selected students are invalid for this class and academic year'
        });
    }

    const classOrSubjectChanged = toId(assignment.class) !== classId || toId(assignment.subject) !== subjectId;
    let normalizedLessonPlanIds;
    if (body.lessonPlanIds !== undefined) {
        normalizedLessonPlanIds = await validateGradeLessonPlanLinks({
            lessonPlanIds: toArray(body.lessonPlanIds),
            schoolId: req.schoolId,
            classId,
            subjectId,
            user: req.user
        });
    } else if (classOrSubjectChanged) {
        // Class/subject changed but caller didn't update lesson plans — clear them
        normalizedLessonPlanIds = [];
    } else {
        // Lesson plans untouched and class/subject unchanged — keep existing
        normalizedLessonPlanIds = assignment.lessonPlanIds || [];
    }

    const status = body.status && ['draft', 'published', 'closed', 'archived'].includes(String(body.status).toLowerCase())
        ? String(body.status).toLowerCase()
        : assignment.status;

    assignment.academicYear = academicYear;
    assignment.class = classId;
    assignment.subject = subjectId;
    assignment.title = title;
    assignment.instructions = body.instructions === undefined
        ? assignment.instructions
        : String(body.instructions || '').trim();
    assignment.assignedDate = assignedDate;
    assignment.dueDate = dueDate;
    assignment.scope = scope;
    assignment.studentIds = scope === 'selected_students' ? validSelectedStudentIds : [];
    assignment.lessonPlanIds = normalizedLessonPlanIds ?? [];
    assignment.maxMarks = body.maxMarks === undefined
        ? assignment.maxMarks
        : parsePositiveNumber(body.maxMarks, assignment.maxMarks);
    assignment.allowLateSubmission = body.allowLateSubmission === undefined
        ? assignment.allowLateSubmission
        : parseBoolean(body.allowLateSubmission, assignment.allowLateSubmission);
    assignment.notifyOnAssign = body.notifyOnAssign === undefined
        ? assignment.notifyOnAssign
        : parseBoolean(body.notifyOnAssign, assignment.notifyOnAssign);
    assignment.notifyAudience = body.notifyAudience === undefined
        ? parseNotifyAudience(assignment.notifyAudience, 'both')
        : parseNotifyAudience(body.notifyAudience, assignment.notifyAudience);
    assignment.notifyOnGrade = body.notifyOnGrade === undefined
        ? assignment.notifyOnGrade
        : parseBoolean(body.notifyOnGrade, assignment.notifyOnGrade);
    assignment.status = status;
    assignment.metadata = body.metadata === undefined ? assignment.metadata : body.metadata;

    // Update links if provided
    if (body.links !== undefined) {
        const rawLinks = typeof body.links === 'string' ? JSON.parse(body.links || '[]') : body.links;
        assignment.links = validateLinks(rawLinks);
    }

    // Handle attachment removals
    if (body.removeAttachmentIds) {
        const removeIds = typeof body.removeAttachmentIds === 'string'
            ? JSON.parse(body.removeAttachmentIds || '[]')
            : body.removeAttachmentIds;
        if (Array.isArray(removeIds) && removeIds.length > 0) {
            const removeSet = new Set(removeIds.map(String));
            const toRemove = (assignment.attachments || []).filter((att) => removeSet.has(toId(att._id)));
            await deleteAttachmentFiles(toRemove);
            assignment.attachments = (assignment.attachments || []).filter((att) => !removeSet.has(toId(att._id)));
        }
    }

    // Upload new attachment files
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length > 0) {
        const uploadedAttachments = await uploadAttachmentFiles(files, req.schoolId, assignment._id);
        assignment.attachments = [...(assignment.attachments || []), ...uploadedAttachments];
    }

    if (type) {
        assignment.assignmentType = type._id;
        assignment.assignmentTypeKey = type.key;
        assignment.assignmentTypeName = type.name;
    }

    if (status === 'published' && !assignment.publishedAt) {
        assignment.publishedAt = new Date();
        assignment.publishedBy = req.user._id;
    }

    await assignment.save();

    const populated = await Assignment.findById(assignment._id)
        .populate('assignmentType', 'key name')
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate('lessonPlanIds', 'title date')
        .lean();

    res.json({
        success: true,
        data: { assignment: mapAssignmentSummary(populated) }
    });
});

export const deleteAssignment = asyncHandler(async (req, res) => {
    const assignment = await Assignment.findOne({ _id: req.params.id, school: req.schoolId });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) return res.status(403).json({ success: false, message: 'Not authorized to delete this assignment' });

    const gradeDeleteResult = await Grade.deleteMany({
        school: req.schoolId,
        assignment: assignment._id
    });

    // Clean up attachment files from storage
    await deleteAttachmentFiles(assignment.attachments);

    await assignment.deleteOne();

    res.json({
        success: true,
        message: 'Assignment deleted successfully',
        data: {
            assignmentId: assignment._id,
            deletedGradesCount: gradeDeleteResult?.deletedCount || 0
        }
    });
});

export const getAssignmentAttachmentUrl = asyncHandler(async (req, res) => {
    const assignment = await Assignment.findOne({ _id: req.params.id, school: req.schoolId }).lean();
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) return res.status(403).json({ success: false, message: 'Not authorized' });

    const attachmentId = req.params.attachmentId;
    const attachment = (assignment.attachments || []).find((att) => toId(att._id) === attachmentId);
    if (!attachment) return res.status(404).json({ success: false, message: 'Attachment not found' });

    const signedUrl = await getSignedUrl(attachment.storageKey);
    res.json({ success: true, data: { url: signedUrl, fileName: attachment.fileName, mimeType: attachment.mimeType } });
});
