import { asyncHandler } from '../middleware/errorHandler.js';
import Class from '../models/Class.js';
import HomeworkAssignment from '../models/HomeworkAssignment.js';
import HomeworkSubmission from '../models/HomeworkSubmission.js';
import LessonPlan from '../models/LessonPlan.js';
import Student from '../models/Student.js';
import Teacher from '../models/Teacher.js';
import notificationService from '../services/notificationService.js';
import { resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import {
    getTeacherClassIds,
    isTeacherAuthorizedForClassSubject,
    resolveTeacherProfile
} from '../helpers/teacherScoping.js';

const toId = (value) => (value == null ? '' : String(value));

const parsePositiveInt = (value, fallback, max = 100) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
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

const parseDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
};

const normalizeScope = (value, studentIds = []) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'selected_students' || normalized === 'selected') {
        return studentIds.length > 0 ? 'selected_students' : 'class';
    }
    return 'class';
};

const mapAssignmentSummary = (assignment) => ({
    id: assignment._id,
    title: assignment.title || '',
    instructions: assignment.instructions || '',
    dueDate: assignment.dueDate || null,
    assignedDate: assignment.assignedDate || null,
    status: assignment.status || 'draft',
    scope: assignment.scope || 'class',
    studentIds: Array.isArray(assignment.studentIds)
        ? assignment.studentIds.map((studentId) => toId(studentId))
        : [],
    maxMarks: Number(assignment.maxMarks || 10),
    allowLateSubmission: assignment.allowLateSubmission === true,
    notifyParentsOnPost: assignment.notifyParentsOnPost !== false,
    postedAt: assignment.postedAt || null,
    postedBy: assignment.postedBy || null,
    lessonPlanId: assignment.lessonPlan ? toId(assignment.lessonPlan?._id || assignment.lessonPlan) : '',
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
        : null,
    teacher: assignment.teacher
        ? {
            id: toId(assignment.teacher?._id || assignment.teacher),
            userId: toId(assignment.teacher?.user?._id || assignment.teacher?.user),
            name: `${assignment.teacher?.user?.firstName || ''} ${assignment.teacher?.user?.lastName || ''}`.trim(),
            employeeId: assignment.teacher?.employeeId || ''
        }
        : null
});

const mapSubmissionRow = (student, submission = null) => ({
    student: {
        id: toId(student._id),
        studentId: student.studentId || '',
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        fullName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
    },
    submission: submission
        ? {
            id: submission._id,
            status: submission.status || 'not_submitted',
            submissionText: submission.submissionText || '',
            submittedAt: submission.submittedAt || null,
            gradedAt: submission.gradedAt || null,
            attemptCount: Number(submission.attemptCount || 0),
            gradeId: submission.grade ? toId(submission.grade) : ''
        }
        : {
            id: '',
            status: 'not_submitted',
            submissionText: '',
            submittedAt: null,
            gradedAt: null,
            attemptCount: 0,
            gradeId: ''
        }
});

const ensureStudentSelectionIsValid = async ({
    schoolId,
    classId,
    academicYear,
    studentIds
}) => {
    if (!Array.isArray(studentIds) || studentIds.length === 0) return [];
    const uniqueIds = [...new Set(studentIds.map((id) => toId(id)).filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const rows = await Student.find({
        school: schoolId,
        _id: { $in: uniqueIds },
        currentClass: classId,
        academicYear,
        status: 'active'
    })
        .select('_id')
        .lean();

    if (rows.length !== uniqueIds.length) {
        return null;
    }
    return uniqueIds;
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
        .lean();
};

const upsertSubmissionPlaceholders = async (assignment, students = []) => {
    if (!Array.isArray(students) || students.length === 0) return;

    const operations = students.map((student) => ({
        updateOne: {
            filter: {
                school: assignment.school,
                homeworkAssignment: assignment._id,
                student: student._id
            },
            update: {
                $setOnInsert: {
                    school: assignment.school,
                    homeworkAssignment: assignment._id,
                    student: student._id,
                    status: 'not_submitted'
                }
            },
            upsert: true
        }
    }));

    if (operations.length > 0) {
        await HomeworkSubmission.bulkWrite(operations, { ordered: false });
    }
};

const sendHomeworkPostedNotifications = async ({
    assignment,
    students,
    createdBy
}) => {
    if (!Array.isArray(students) || students.length === 0) return;

    await Promise.allSettled(
        students.map((student) =>
            notificationService.sendHomeworkPostedNotification({
                studentId: student._id,
                assignment,
                createdBy
            })
        )
    );
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

const resolveTeacherForCreate = async ({
    req,
    classDoc,
    subjectId,
    teacherId
}) => {
    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return { error: 'Teacher profile not found' };
        }
        const authorized = await isTeacherAuthorizedForClassSubject(
            teacher._id,
            toId(classDoc._id),
            subjectId
        );
        if (!authorized) {
            return { error: 'You are not authorized for this class and subject' };
        }
        return { teacherId: teacher._id };
    }

    const requestedTeacherId = toId(teacherId);
    if (requestedTeacherId) {
        const teacher = await Teacher.findOne({
            _id: requestedTeacherId,
            school: req.schoolId,
            isActive: true
        })
            .select('_id')
            .lean();
        if (!teacher) {
            return { error: 'Provided teacherId is invalid for this school' };
        }
        return { teacherId: teacher._id };
    }

    const subjectTeacher = (classDoc.subjects || []).find(
        (entry) => toId(entry.subject) === subjectId
    );
    if (subjectTeacher?.teacher) {
        return { teacherId: subjectTeacher.teacher };
    }
    if (classDoc.classTeacher) {
        return { teacherId: classDoc.classTeacher };
    }
    return { error: 'Could not resolve teacher for this class/subject' };
};

const resolveStudentSelf = async (req, academicYear) => {
    let student = await Student.findOne({
        school: req.schoolId,
        user: req.user._id,
        academicYear,
        status: 'active'
    }).lean();

    if (!student) {
        student = await Student.findOne({
            school: req.schoolId,
            user: req.user._id,
            status: 'active'
        }).lean();
    }
    return student;
};

const buildStudentVisibleHomeworkQuery = ({ student, academicYear }) => ({
    school: student.school,
    academicYear,
    class: student.currentClass,
    status: { $in: ['published', 'closed'] },
    $or: [
        { scope: 'class' },
        { scope: 'selected_students', studentIds: student._id }
    ]
});

export const getHomeworkAssignments = asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1, 5000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const allowYearOverride = req.user.role === 'admin' || req.user.role === 'super_admin';
    const academicYear = resolveAcademicYearForRequest(
        req,
        req.query.academicYear,
        { allowOverride: allowYearOverride }
    );

    const query = {
        school: req.schoolId,
        academicYear
    };

    const classId = toId(req.query.classId || req.query.class);
    const subjectId = toId(req.query.subjectId || req.query.subject);
    const status = String(req.query.status || '').trim().toLowerCase();
    const teacherId = toId(req.query.teacherId || req.query.teacher);

    if (status && ['draft', 'published', 'closed', 'archived'].includes(status)) {
        query.status = status;
    }
    if (classId) query.class = classId;
    if (subjectId) query.subject = subjectId;

    if (req.user.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) {
            return res.status(403).json({
                success: false,
                message: 'Teacher profile not found'
            });
        }
        const allowedClassIds = await getTeacherClassIds(teacher._id);
        const allowedSet = new Set(allowedClassIds.map((id) => toId(id)));
        if (classId && !allowedSet.has(classId)) {
            return res.json({
                success: true,
                data: {
                    items: [],
                    pagination: { page, limit, total: 0, totalPages: 0 }
                }
            });
        }

        if (!classId) {
            query.class = { $in: [...allowedSet] };
        }
    } else if (teacherId) {
        query.teacher = teacherId;
    }

    const [rows, total] = await Promise.all([
        HomeworkAssignment.find(query)
            .populate('class', 'name grade section')
            .populate('subject', 'name code')
            .populate({
                path: 'teacher',
                select: 'employeeId user',
                populate: { path: 'user', select: 'firstName lastName' }
            })
            .sort({ dueDate: 1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        HomeworkAssignment.countDocuments(query)
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

export const getHomeworkAssignmentById = asyncHandler(async (req, res) => {
    const assignment = await HomeworkAssignment.findOne({
        _id: req.params.id,
        school: req.schoolId
    })
        .populate('class', 'name grade section academicYear')
        .populate('subject', 'name code')
        .populate({
            path: 'teacher',
            select: 'employeeId user',
            populate: { path: 'user', select: 'firstName lastName' }
        });

    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Homework assignment not found' });
    }

    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) {
        return res.status(403).json({ success: false, message: 'Not authorized to access this assignment' });
    }

    res.json({
        success: true,
        data: { assignment: mapAssignmentSummary(assignment) }
    });
});

export const createHomeworkAssignment = asyncHandler(async (req, res) => {
    const body = req.body || {};
    const classId = toId(body.classId || body.class);
    const subjectId = toId(body.subjectId || body.subject);
    const title = String(body.title || '').trim();
    const instructions = String(body.instructions || '').trim();
    const dueDate = parseDate(body.dueDate);

    if (!classId || !subjectId || !title || !instructions || !dueDate) {
        return res.status(400).json({
            success: false,
            message: 'classId, subjectId, title, instructions, and valid dueDate are required'
        });
    }

    const allowYearOverride = req.user.role === 'admin' || req.user.role === 'super_admin';
    const academicYear = resolveAcademicYearForRequest(req, body.academicYear, {
        allowOverride: allowYearOverride
    });

    const classDoc = await Class.findOne({
        _id: classId,
        school: req.schoolId,
        academicYear
    });
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

    const teacherResolution = await resolveTeacherForCreate({
        req,
        classDoc,
        subjectId,
        teacherId: body.teacherId
    });
    if (!teacherResolution.teacherId) {
        return res.status(403).json({
            success: false,
            message: teacherResolution.error || 'Could not resolve teacher'
        });
    }

    const lessonPlanId = toId(body.lessonPlanId || body.lessonPlan);
    if (lessonPlanId) {
        const lesson = await LessonPlan.findOne({
            _id: lessonPlanId,
            school: req.schoolId,
            class: classId,
            subject: subjectId
        })
            .select('_id')
            .lean();
        if (!lesson) {
            return res.status(400).json({
                success: false,
                message: 'lessonPlanId is not valid for selected class and subject'
            });
        }
    }

    const requestedStudentIds = Array.isArray(body.studentIds) ? body.studentIds : [];
    const scope = normalizeScope(body.scope, requestedStudentIds);
    const normalizedStudentIds = await ensureStudentSelectionIsValid({
        schoolId: req.schoolId,
        classId,
        academicYear,
        studentIds: requestedStudentIds
    });
    if (scope === 'selected_students' && normalizedStudentIds === null) {
        return res.status(400).json({
            success: false,
            message: 'One or more selected students are invalid for this class and academic year'
        });
    }

    const requestedStatus = String(body.status || '').trim().toLowerCase();
    const publishNow = parseBoolean(body.publishNow, false) || requestedStatus === 'published';
    const now = new Date();

    const assignment = await HomeworkAssignment.create({
        school: req.schoolId,
        academicYear,
        class: classId,
        subject: subjectId,
        teacher: teacherResolution.teacherId,
        lessonPlan: lessonPlanId || null,
        title,
        instructions,
        dueDate,
        assignedDate: now,
        status: publishNow ? 'published' : 'draft',
        scope,
        studentIds: scope === 'selected_students' ? normalizedStudentIds : [],
        maxMarks: Number(body.maxMarks || 10),
        allowLateSubmission: parseBoolean(body.allowLateSubmission, false),
        notifyParentsOnPost: parseBoolean(body.notifyParentsOnPost, true),
        postedAt: publishNow ? now : null,
        postedBy: publishNow ? req.user._id : null,
        metadata: body.metadata ?? null
    });

    if (publishNow) {
        const students = await resolveTargetStudentsForAssignment(assignment);
        await upsertSubmissionPlaceholders(assignment, students);
        if (assignment.notifyParentsOnPost !== false) {
            await sendHomeworkPostedNotifications({
                assignment,
                students,
                createdBy: req.user._id
            });
        }
    }

    const populated = await HomeworkAssignment.findById(assignment._id)
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate({
            path: 'teacher',
            select: 'employeeId user',
            populate: { path: 'user', select: 'firstName lastName' }
        })
        .lean();

    res.status(201).json({
        success: true,
        data: {
            assignment: mapAssignmentSummary(populated)
        }
    });
});

export const updateHomeworkAssignment = asyncHandler(async (req, res) => {
    const assignment = await HomeworkAssignment.findOne({
        _id: req.params.id,
        school: req.schoolId
    });

    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Homework assignment not found' });
    }

    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) {
        return res.status(403).json({ success: false, message: 'Not authorized to update this assignment' });
    }

    const body = req.body || {};
    const requestedStatus = String(body.status || '').trim().toLowerCase();
    let becamePublished = false;
    const draftOnlyFields = ['classId', 'class', 'subjectId', 'subject', 'scope', 'studentIds', 'lessonPlanId', 'lessonPlan', 'teacherId'];
    if (assignment.status !== 'draft') {
        const hasDraftOnlyChange = draftOnlyFields.some((field) => body[field] !== undefined);
        if (hasDraftOnlyChange) {
            return res.status(400).json({
                success: false,
                message: 'Class, subject, scope, lesson plan, and target students can only be changed while draft'
            });
        }
    }

    if (body.title !== undefined) {
        const value = String(body.title || '').trim();
        if (!value) {
            return res.status(400).json({ success: false, message: 'title cannot be empty' });
        }
        assignment.title = value;
    }
    if (body.instructions !== undefined) {
        const value = String(body.instructions || '').trim();
        if (!value) {
            return res.status(400).json({ success: false, message: 'instructions cannot be empty' });
        }
        assignment.instructions = value;
    }
    if (body.dueDate !== undefined) {
        const parsed = parseDate(body.dueDate);
        if (!parsed) {
            return res.status(400).json({ success: false, message: 'Invalid dueDate' });
        }
        assignment.dueDate = parsed;
    }
    if (body.maxMarks !== undefined) {
        const parsed = Number(body.maxMarks);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return res.status(400).json({ success: false, message: 'maxMarks must be a positive number' });
        }
        assignment.maxMarks = parsed;
    }
    if (body.allowLateSubmission !== undefined) {
        assignment.allowLateSubmission = parseBoolean(body.allowLateSubmission, false);
    }
    if (body.notifyParentsOnPost !== undefined) {
        assignment.notifyParentsOnPost = parseBoolean(body.notifyParentsOnPost, true);
    }

    if (assignment.status === 'draft') {
        const classId = toId(body.classId || body.class || assignment.class);
        const subjectId = toId(body.subjectId || body.subject || assignment.subject);

        const classDoc = await Class.findOne({
            _id: classId,
            school: req.schoolId,
            academicYear: assignment.academicYear
        })
            .select('_id subjects')
            .lean();
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
                return res.status(403).json({
                    success: false,
                    message: 'Teacher profile not found'
                });
            }
            const authorized = await isTeacherAuthorizedForClassSubject(
                teacher._id,
                classId,
                subjectId
            );
            if (!authorized) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not authorized for this class and subject'
                });
            }
        } else if (body.teacherId !== undefined) {
            const nextTeacherId = toId(body.teacherId);
            if (nextTeacherId) {
                const teacher = await Teacher.findOne({
                    _id: nextTeacherId,
                    school: req.schoolId,
                    isActive: true
                })
                    .select('_id')
                    .lean();
                if (!teacher) {
                    return res.status(400).json({
                        success: false,
                        message: 'Provided teacherId is invalid for this school'
                    });
                }
                assignment.teacher = teacher._id;
            }
        }

        if (toId(assignment.class) !== classId) assignment.class = classId;
        if (toId(assignment.subject) !== subjectId) assignment.subject = subjectId;

        const requestedStudentIds = Array.isArray(body.studentIds) ? body.studentIds : assignment.studentIds;
        assignment.scope = normalizeScope(body.scope || assignment.scope, requestedStudentIds);

        const normalizedStudentIds = await ensureStudentSelectionIsValid({
            schoolId: req.schoolId,
            classId: toId(assignment.class),
            academicYear: assignment.academicYear,
            studentIds: requestedStudentIds
        });
        if (assignment.scope === 'selected_students' && normalizedStudentIds === null) {
            return res.status(400).json({
                success: false,
                message: 'One or more selected students are invalid for this class and academic year'
            });
        }
        assignment.studentIds = assignment.scope === 'selected_students' ? normalizedStudentIds : [];

        const lessonPlanId = toId(body.lessonPlanId || body.lessonPlan || assignment.lessonPlan);
        if (lessonPlanId) {
            const lesson = await LessonPlan.findOne({
                _id: lessonPlanId,
                school: req.schoolId,
                class: assignment.class,
                subject: assignment.subject
            })
                .select('_id')
                .lean();
            if (!lesson) {
                return res.status(400).json({
                    success: false,
                    message: 'lessonPlanId is not valid for selected class and subject'
                });
            }
            assignment.lessonPlan = lessonPlanId;
        } else if (body.lessonPlanId !== undefined || body.lessonPlan !== undefined) {
            assignment.lessonPlan = null;
        }
    }

    if (requestedStatus) {
        if (!['draft', 'published', 'closed', 'archived'].includes(requestedStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid status value' });
        }
        if (assignment.status === 'draft' && requestedStatus === 'published') {
            assignment.status = 'published';
            assignment.postedAt = new Date();
            assignment.postedBy = req.user._id;
            becamePublished = true;
        } else if (assignment.status === 'published' && ['closed', 'archived'].includes(requestedStatus)) {
            assignment.status = requestedStatus;
        } else if (assignment.status === requestedStatus) {
            // no-op
        } else {
            return res.status(400).json({
                success: false,
                message: `Cannot change status from ${assignment.status} to ${requestedStatus}`
            });
        }
    }

    await assignment.save();

    if (assignment.status === 'published') {
        const students = await resolveTargetStudentsForAssignment(assignment);
        await upsertSubmissionPlaceholders(assignment, students);
        if (becamePublished && assignment.notifyParentsOnPost !== false) {
            await sendHomeworkPostedNotifications({
                assignment,
                students,
                createdBy: req.user._id
            });
        }
    }

    const populated = await HomeworkAssignment.findById(assignment._id)
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate({
            path: 'teacher',
            select: 'employeeId user',
            populate: { path: 'user', select: 'firstName lastName' }
        })
        .lean();

    res.json({
        success: true,
        data: {
            assignment: mapAssignmentSummary(populated)
        }
    });
});

export const publishHomeworkAssignment = asyncHandler(async (req, res) => {
    const assignment = await HomeworkAssignment.findOne({
        _id: req.params.id,
        school: req.schoolId
    });

    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Homework assignment not found' });
    }

    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) {
        return res.status(403).json({ success: false, message: 'Not authorized to publish this assignment' });
    }

    if (assignment.status === 'archived') {
        return res.status(400).json({ success: false, message: 'Archived assignments cannot be published' });
    }

    const notifyParents = req.body?.notifyParentsOnPost !== undefined
        ? parseBoolean(req.body.notifyParentsOnPost, true)
        : assignment.notifyParentsOnPost !== false;

    assignment.status = 'published';
    assignment.notifyParentsOnPost = notifyParents;
    assignment.postedAt = new Date();
    assignment.postedBy = req.user._id;
    await assignment.save();

    const students = await resolveTargetStudentsForAssignment(assignment);
    await upsertSubmissionPlaceholders(assignment, students);
    if (notifyParents) {
        await sendHomeworkPostedNotifications({
            assignment,
            students,
            createdBy: req.user._id
        });
    }

    const populated = await HomeworkAssignment.findById(assignment._id)
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate({
            path: 'teacher',
            select: 'employeeId user',
            populate: { path: 'user', select: 'firstName lastName' }
        })
        .lean();

    res.json({
        success: true,
        data: {
            assignment: mapAssignmentSummary(populated)
        }
    });
});

export const getHomeworkSubmissions = asyncHandler(async (req, res) => {
    const assignment = await HomeworkAssignment.findOne({
        _id: req.params.id,
        school: req.schoolId
    })
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .populate({
            path: 'teacher',
            select: 'employeeId user',
            populate: { path: 'user', select: 'firstName lastName' }
        });

    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Homework assignment not found' });
    }

    const canAccess = await verifyTeacherCanAccessAssignment(req, assignment);
    if (!canAccess) {
        return res.status(403).json({ success: false, message: 'Not authorized to view submissions' });
    }

    const students = await resolveTargetStudentsForAssignment(assignment);
    const submissions = await HomeworkSubmission.find({
        school: req.schoolId,
        homeworkAssignment: assignment._id,
        student: { $in: students.map((item) => item._id) }
    })
        .select('_id student status submissionText submittedAt gradedAt attemptCount grade')
        .lean();
    const submissionMap = new Map(submissions.map((item) => [toId(item.student), item]));

    const rows = students.map((student) => mapSubmissionRow(student, submissionMap.get(toId(student._id))));
    const summary = {
        totalStudents: rows.length,
        submitted: rows.filter((row) => ['submitted', 'late', 'graded'].includes(row.submission.status)).length,
        graded: rows.filter((row) => row.submission.status === 'graded').length,
        late: rows.filter((row) => row.submission.status === 'late').length,
        pending: rows.filter((row) => row.submission.status === 'not_submitted').length
    };

    res.json({
        success: true,
        data: {
            assignment: mapAssignmentSummary(assignment),
            summary,
            submissions: rows
        }
    });
});

export const getMyHomeworkAssignments = asyncHandler(async (req, res) => {
    const page = parsePositiveInt(req.query.page, 1, 5000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const academicYear = resolveAcademicYearForRequest(req, req.query.academicYear);
    const student = await resolveStudentSelf(req, academicYear);

    if (!student || !student.currentClass) {
        return res.json({
            success: true,
            data: {
                items: [],
                pagination: { page, limit, total: 0, totalPages: 0 }
            }
        });
    }

    const query = buildStudentVisibleHomeworkQuery({ student, academicYear });
    const status = String(req.query.status || '').trim().toLowerCase();
    if (status && ['published', 'closed'].includes(status)) {
        query.status = status;
    }

    const [rows, total] = await Promise.all([
        HomeworkAssignment.find(query)
            .populate('class', 'name grade section')
            .populate('subject', 'name code')
            .sort({ dueDate: 1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        HomeworkAssignment.countDocuments(query)
    ]);

    const assignmentIds = rows.map((row) => row._id);
    const submissions = await HomeworkSubmission.find({
        school: req.schoolId,
        homeworkAssignment: { $in: assignmentIds },
        student: student._id
    })
        .select('homeworkAssignment status submittedAt gradedAt attemptCount grade')
        .lean();
    const submissionMap = new Map(submissions.map((item) => [toId(item.homeworkAssignment), item]));

    const items = rows.map((assignment) => ({
        ...mapAssignmentSummary(assignment),
        mySubmission: submissionMap.get(toId(assignment._id))
            ? {
                status: submissionMap.get(toId(assignment._id)).status || 'not_submitted',
                submittedAt: submissionMap.get(toId(assignment._id)).submittedAt || null,
                gradedAt: submissionMap.get(toId(assignment._id)).gradedAt || null,
                attemptCount: Number(submissionMap.get(toId(assignment._id)).attemptCount || 0),
                gradeId: submissionMap.get(toId(assignment._id)).grade ? toId(submissionMap.get(toId(assignment._id)).grade) : ''
            }
            : {
                status: 'not_submitted',
                submittedAt: null,
                gradedAt: null,
                attemptCount: 0,
                gradeId: ''
            }
    }));

    res.json({
        success: true,
        data: {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        }
    });
});

export const getMyHomeworkAssignmentById = asyncHandler(async (req, res) => {
    const academicYear = resolveAcademicYearForRequest(req, req.query.academicYear);
    const student = await resolveStudentSelf(req, academicYear);
    if (!student || !student.currentClass) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const query = buildStudentVisibleHomeworkQuery({ student, academicYear });
    query._id = req.params.id;

    const assignment = await HomeworkAssignment.findOne(query)
        .populate('class', 'name grade section')
        .populate('subject', 'name code')
        .lean();
    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Homework assignment not found' });
    }

    const submission = await HomeworkSubmission.findOne({
        school: req.schoolId,
        homeworkAssignment: assignment._id,
        student: student._id
    })
        .select('status submissionText submittedAt gradedAt attemptCount grade')
        .lean();

    res.json({
        success: true,
        data: {
            assignment: {
                ...mapAssignmentSummary(assignment),
                mySubmission: submission
                    ? {
                        status: submission.status || 'not_submitted',
                        submissionText: submission.submissionText || '',
                        submittedAt: submission.submittedAt || null,
                        gradedAt: submission.gradedAt || null,
                        attemptCount: Number(submission.attemptCount || 0),
                        gradeId: submission.grade ? toId(submission.grade) : ''
                    }
                    : {
                        status: 'not_submitted',
                        submissionText: '',
                        submittedAt: null,
                        gradedAt: null,
                        attemptCount: 0,
                        gradeId: ''
                    }
            }
        }
    });
});

export const submitMyHomeworkAssignment = asyncHandler(async (req, res) => {
    const academicYear = resolveAcademicYearForRequest(req, req.query.academicYear);
    const student = await resolveStudentSelf(req, academicYear);
    if (!student || !student.currentClass) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const query = buildStudentVisibleHomeworkQuery({ student, academicYear });
    query._id = req.params.id;

    const assignment = await HomeworkAssignment.findOne(query);
    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Homework assignment not found' });
    }

    if (assignment.status !== 'published') {
        return res.status(400).json({
            success: false,
            message: 'Homework is not open for submission'
        });
    }

    const submissionText = String(req.body?.submissionText || '').trim();
    if (!submissionText) {
        return res.status(400).json({
            success: false,
            message: 'submissionText is required'
        });
    }

    const now = new Date();
    const isLate = now > new Date(assignment.dueDate);
    if (isLate && assignment.allowLateSubmission !== true) {
        return res.status(400).json({
            success: false,
            message: 'Late submission is not allowed for this homework'
        });
    }

    const existing = await HomeworkSubmission.findOne({
        school: req.schoolId,
        homeworkAssignment: assignment._id,
        student: student._id
    }).lean();
    if (existing?.status === 'graded') {
        return res.status(400).json({
            success: false,
            message: 'Homework has already been graded and cannot be resubmitted'
        });
    }

    const submission = await HomeworkSubmission.findOneAndUpdate(
        {
            school: req.schoolId,
            homeworkAssignment: assignment._id,
            student: student._id
        },
        {
            $set: {
                status: isLate ? 'late' : 'submitted',
                submissionText,
                submittedAt: now
            },
            $inc: { attemptCount: 1 },
            $setOnInsert: {
                school: req.schoolId,
                homeworkAssignment: assignment._id,
                student: student._id
            }
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    ).lean();

    res.status(200).json({
        success: true,
        data: {
            submission: {
                id: submission._id,
                status: submission.status || 'submitted',
                submissionText: submission.submissionText || '',
                submittedAt: submission.submittedAt || null,
                attemptCount: Number(submission.attemptCount || 0)
            }
        }
    });
});
