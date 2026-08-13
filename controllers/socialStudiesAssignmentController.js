import mongoose from 'mongoose';
import SocialStudiesAssignment from '../models/SocialStudiesAssignment.js';
import SocialStudiesLesson from '../models/SocialStudiesLesson.js';
import SocialStudiesSubmission from '../models/SocialStudiesSubmission.js';
import GradebookColumn from '../models/GradebookColumn.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile } from '../helpers/teacherScoping.js';
import { resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import { resolveSemesterForDate } from '../services/gradebookConfigService.js';
import notificationService from '../services/notificationService.js';
import logger from '../utils/logger.js';

const normalizeSemester = (v) => {
    const n = Number(v);
    return [1, 2].includes(n) ? n : null;
};

const sumPoints = (questions = []) =>
    questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0);

// ── Create gradebook column for this assignment ───────────────────────────
const ensureGradebookColumn = async ({ assignment, schoolId, userId }) => {
    if (assignment.gradebookColumn) return assignment.gradebookColumn;

    const categoryMap = { classwork: 'classwork', homework: 'homework', quiz: 'quiz' };
    const category = categoryMap[assignment.assignmentType] || 'classwork';

    const existing = await GradebookColumn.findOne({
        school: schoolId,
        class: assignment.class,
        subject: assignment.subject,
        name: assignment.title,
        academicYear: assignment.academicYear,
        semester: assignment.semester,
        category,
    }).setOptions({ skipTenantFilter: true });

    if (existing) return existing._id;

    const column = await GradebookColumn.create({
        school: schoolId,
        class: assignment.class,
        subject: assignment.subject || assignment.class,   // fallback if no subject
        academicYear: assignment.academicYear,
        semester: assignment.semester || 1,
        name: assignment.title,
        category,
        date: assignment.publishedAt || new Date(),
        maxMarks: assignment.totalPoints || 10,
        sortOrder: 0,
        createdBy: userId,
    });

    return column._id;
};

// GET /api/social-studies/assignments  (teacher)
export const getAssignments = asyncHandler(async (req, res) => {
    const { classId, unitId, lessonId, status, academicYear, semester } = req.query;
    const effectiveAcademicYear = resolveAcademicYearForRequest(req, academicYear);

    const filter = { school: req.schoolId, isActive: true };
    if (effectiveAcademicYear) filter.academicYear = effectiveAcademicYear;
    if (classId) filter.class = classId;
    if (unitId) filter.unit = unitId;
    if (lessonId) filter.lesson = lessonId;
    if (status) filter.status = status;
    if (semester) filter.semester = normalizeSemester(semester);

    const assignments = await SocialStudiesAssignment.find(filter)
        .populate('class', 'name grade section')
        .populate('lesson', 'title')
        .populate('unit', 'title')
        .sort({ createdAt: -1 })
        .lean();

    res.json({ success: true, data: assignments });
});

// GET /api/social-studies/assignments/:id
export const getAssignment = asyncHandler(async (req, res) => {
    // Student-safe view: only assigned, published work and no answer key.
    if (req.user?.role === 'student') {
        const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).lean();
        if (!student) {
            return res.status(403).json({ success: false, message: 'Student record not found' });
        }

        const assignment = await SocialStudiesAssignment.findOne({
            _id: req.params.id,
            school: req.schoolId,
            isActive: true,
            status: 'published',
            class: student.currentClass,
            $or: [
                { scope: 'class' },
                { scope: 'selected_students', studentIds: student._id },
            ],
        })
            .populate('class', 'name grade section')
            .populate('lesson', 'title estimatedDuration')
            .populate('unit', 'title')
            .lean();

        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }

        const now = new Date();
        if (assignment.availability?.startAt && now < new Date(assignment.availability.startAt)) {
            return res.status(403).json({ success: false, message: 'This assignment is not yet available' });
        }
        if (assignment.availability?.endAt && now > new Date(assignment.availability.endAt)) {
            return res.status(403).json({ success: false, message: 'This assignment has expired' });
        }

        const safeQuestions = (assignment.questions || []).map((q) => ({
            questionId: q.questionId || q._id,
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options || [],
            difficulty: q.difficulty || 'medium',
            points: q.points || 1,
        }));

        return res.json({
            success: true,
            data: {
                ...assignment,
                questions: safeQuestions,
            },
        });
    }

    const assignment = await SocialStudiesAssignment.findOne({
        _id: req.params.id,
        school: req.schoolId,
    })
        .populate('class', 'name grade section')
        .populate('lesson', 'title')
        .populate('unit', 'title')
        .lean();
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    res.json({ success: true, data: assignment });
});

// GET /api/social-studies/assignments/student  (student sees their assigned work)
export const getAssignmentsForStudent = asyncHandler(async (req, res) => {
    const { academicYear, status } = req.query;
    const effectiveAcademicYear = resolveAcademicYearForRequest(req, academicYear);

    // Find student doc linked to this user
    const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).lean();
    if (!student) return res.json({ success: true, data: [] });

    const classId = student.currentClass;

    const filter = {
        school: req.schoolId,
        class: classId,
        status: 'published',
        isActive: true,
        $or: [
            { scope: 'class' },
            { scope: 'selected_students', studentIds: student._id },
        ],
    };
    if (effectiveAcademicYear) filter.academicYear = effectiveAcademicYear;
    if (status) filter.status = status;

    const assignments = await SocialStudiesAssignment.find(filter)
        .populate('unit', 'title')
        .populate('lesson', 'title estimatedDuration')
        .select('-questions')   // no questions in list view
        .sort({ dueDate: 1, createdAt: -1 })
        .lean();

    // Attach submission status for each assignment
    const assignmentIds = assignments.map(a => a._id);
    const submissions = await SocialStudiesSubmission.find({
        school: req.schoolId,
        student: student._id,
        assignment: { $in: assignmentIds },
    }).select('assignment status score totalPoints percentage').lean();

    const subMap = Object.fromEntries(submissions.map(s => [s.assignment.toString(), s]));

    const result = assignments.map(a => ({
        ...a,
        submission: subMap[a._id.toString()] || null,
    }));

    res.json({ success: true, data: result });
});

// POST /api/social-studies/assignments
export const createAssignment = asyncHandler(async (req, res) => {
    const {
        unitId, lessonId, classId, subjectId,
        title, instructions, assignmentType,
        questionIds, timeLimit, maxAttempts,
        dueDate, availability, academicYear, semester,
        scope, studentIds, notifyStudents, notifyParents,
    } = req.body;

    if (!unitId || !lessonId || !classId || !title?.trim()) {
        return res.status(400).json({ success: false, message: 'unitId, lessonId, classId, and title are required' });
    }

    const lesson = await SocialStudiesLesson.findById(lessonId).lean();
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

    const teacher = await resolveTeacherProfile(req);
    const effectiveAcademicYear = resolveAcademicYearForRequest(req, academicYear);
    const effectiveSemester = normalizeSemester(semester) || (await resolveSemesterForDate(req.schoolId, new Date()));

    // Pick questions — if questionIds provided, filter; else use all active questions
    const allQuestions = (lesson.questions || []).filter(q => q.isActive !== false);
    let selectedQuestions = allQuestions;
    if (Array.isArray(questionIds) && questionIds.length > 0) {
        const idSet = new Set(questionIds.map(String));
        selectedQuestions = allQuestions.filter(q => idSet.has(q._id.toString()));
    }

    const snapshotQuestions = selectedQuestions.map(q => ({
        questionId: q._id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options || [],
        correctAnswer: q.correctAnswer || '',
        explanation: q.explanation || '',
        difficulty: q.difficulty || 'medium',
        points: q.points || 1,
    }));

    const totalPoints = sumPoints(snapshotQuestions);

    const assignment = await SocialStudiesAssignment.create({
        school: req.schoolId,
        teacher: teacher?._id || req.user._id,
        unit: unitId,
        lesson: lessonId,
        class: classId,
        subject: subjectId || null,
        title: title.trim(),
        instructions: instructions?.trim() || '',
        assignmentType: assignmentType || 'classwork',
        questions: snapshotQuestions,
        totalPoints,
        scope: scope || 'class',
        studentIds: scope === 'selected_students' ? (studentIds || []) : [],
        timeLimit: timeLimit ? Number(timeLimit) : null,
        maxAttempts: maxAttempts ? Number(maxAttempts) : 1,
        dueDate: dueDate || null,
        availability: {
            startAt: availability?.startAt || null,
            endAt: availability?.endAt || null,
        },
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
        notifyStudents: notifyStudents !== false,
        notifyParents: notifyParents !== false,
    });

    res.status(201).json({ success: true, data: assignment });
});

// PUT /api/social-studies/assignments/:id
export const updateAssignment = asyncHandler(async (req, res) => {
    const assignment = await SocialStudiesAssignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (assignment.status === 'published') {
        return res.status(400).json({ success: false, message: 'Cannot edit a published assignment' });
    }

    const {
        title, instructions, assignmentType, dueDate,
        availability, timeLimit, maxAttempts, scope, studentIds,
        notifyStudents, notifyParents,
    } = req.body;

    if (title != null) assignment.title = title.trim();
    if (instructions != null) assignment.instructions = instructions.trim();
    if (assignmentType != null) assignment.assignmentType = assignmentType;
    if (dueDate != null) assignment.dueDate = dueDate;
    if (availability != null) assignment.availability = availability;
    if (timeLimit != null) assignment.timeLimit = Number(timeLimit);
    if (maxAttempts != null) assignment.maxAttempts = Number(maxAttempts);
    if (scope != null) assignment.scope = scope;
    if (studentIds != null) assignment.studentIds = studentIds;
    if (typeof notifyStudents === 'boolean') assignment.notifyStudents = notifyStudents;
    if (typeof notifyParents === 'boolean') assignment.notifyParents = notifyParents;

    await assignment.save();
    res.json({ success: true, data: assignment });
});

// POST /api/social-studies/assignments/:id/publish
export const publishAssignment = asyncHandler(async (req, res) => {
    const assignment = await SocialStudiesAssignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (assignment.status === 'published') {
        return res.status(400).json({ success: false, message: 'Already published' });
    }
    if (assignment.questions.length === 0) {
        return res.status(400).json({ success: false, message: 'Cannot publish an assignment with no questions' });
    }

    assignment.status = 'published';
    assignment.publishedAt = new Date();

    // Create gradebook column
    try {
        const columnId = await ensureGradebookColumn({
            assignment,
            schoolId: req.schoolId,
            userId: req.user._id,
        });
        assignment.gradebookColumn = columnId;
    } catch (err) {
        logger.warn('social_studies_assignment_column_failed', { err: err.message });
    }

    await assignment.save();

    // Notify students
    if (assignment.notifyStudents) {
        try {
            const classDoc = await Class.findById(assignment.class).select('name').lean();
            const typeLabel = assignment.assignmentType.charAt(0).toUpperCase() + assignment.assignmentType.slice(1);
            await notificationService.notifyClass({
                schoolId: req.schoolId,
                classId: assignment.class,
                subject: `New Social Studies ${typeLabel}: ${assignment.title}`,
                message: `A new Social Studies ${typeLabel} "${assignment.title}" has been assigned${assignment.dueDate ? `. Due: ${new Date(assignment.dueDate).toLocaleDateString()}` : ''}.`,
                type: 'assignment',
                notifyParents: assignment.notifyParents,
            });
        } catch (err) {
            logger.warn('social_studies_notify_failed', { err: err.message });
        }
    }

    res.json({ success: true, data: assignment });
});

// PATCH /api/social-studies/assignments/:id/close
export const closeAssignment = asyncHandler(async (req, res) => {
    const assignment = await SocialStudiesAssignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    assignment.status = 'closed';
    await assignment.save();
    res.json({ success: true, data: assignment });
});

// DELETE /api/social-studies/assignments/:id
export const deleteAssignment = asyncHandler(async (req, res) => {
    const assignment = await SocialStudiesAssignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    assignment.isActive = false;
    await assignment.save();
    res.json({ success: true, message: 'Assignment deleted' });
});

// GET /api/social-studies/assignments/:id/results  (teacher view)
export const getAssignmentResults = asyncHandler(async (req, res) => {
    const assignment = await SocialStudiesAssignment.findById(req.params.id).lean();
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    const submissions = await SocialStudiesSubmission.find({
        school: req.schoolId,
        assignment: assignment._id,
    })
        .populate('student', 'firstName lastName studentId')
        .lean();

    res.json({ success: true, data: { assignment, submissions } });
});
