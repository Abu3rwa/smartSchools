import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import SpellingSession from '../models/SpellingSession.js';
import Class from '../models/Class.js';
import { getTeacherClassIds, resolveTeacherProfile } from '../helpers/teacherScoping.js';
import { validateSpellingIntegrityEvent } from '../utils/spellingIntegrity.js';
import {
    abandonSpellingSession,
    completeSpellingSession,
    getCurrentSpellingItem,
    recordSpellingAttempt,
    startSpellingSession
} from '../services/spellingSessionService.js';
import { listSpellingIntegrityEvents, recordSpellingIntegrityEvent } from '../services/spellingReadService.js';

export const createSpellingIntegrityEvent = asyncHandler(async (req, res) => {
    if (req.user?.role !== 'student') return res.status(403).json({ success: false, message: 'Student access required' });
    const { eventId, sequence, occurredAt } = validateSpellingIntegrityEvent(req.body);

    const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).select('_id').lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
    const result = await recordSpellingIntegrityEvent({
        schoolId: req.schoolId,
        studentId: student._id,
        sessionId: req.params.id,
        eventId,
        sequence,
        occurredAt
    });
    return res.json({ success: true, data: result });
});

export const getSpellingIntegrityEvents = asyncHandler(async (req, res) => {
    const session = await SpellingSession.findOne({ _id: req.params.id, school: req.schoolId }).select('student').lean();
    if (!session) return res.status(404).json({ success: false, message: 'Spelling session not found' });
    const student = await Student.findOne({ _id: session.student, school: req.schoolId }).select('currentClass enrolledClasses department').lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    if (req.user?.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        const teacherClassIds = await getTeacherClassIds(teacher._id);
        const studentClassIds = [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean).map(String);
        if (!teacherClassIds.some((classId) => studentClassIds.includes(String(classId)))) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this spelling session' });
        }
    } else if (req.user?.role === 'department_principal') {
        if (!req.departmentId) return res.status(403).json({ success: false, message: 'Department scope required' });
        const classes = await Class.find({ _id: { $in: [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean) }, school: req.schoolId }).select('department').lean();
        if (student.department?.toString() !== req.departmentId.toString() && !classes.some((classDoc) => classDoc.department?.toString() === req.departmentId.toString())) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this spelling session' });
        }
    }

    const data = await listSpellingIntegrityEvents({ schoolId: req.schoolId, sessionId: req.params.id });
    return res.json({ success: true, data });
});

const resolveStudentId = async (req) => {
    if (req.user?.role === 'student') {
        const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).select('_id').lean();
        return student?._id;
    }
    return req.body?.studentId;
};

export const startSession = asyncHandler(async (req, res) => {
    const studentId = await resolveStudentId(req);
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId is required' });

    const session = await startSpellingSession({
        schoolId: req.schoolId,
        studentId,
        userId: req.user._id,
        mode: req.body.mode,
        maxMistakesAllowed: Number(req.body.maxMistakesAllowed),
        retestDeadline: req.body.retestDeadline,
        curriculumGrade: req.body.curriculumGrade,
        curriculumWeek: req.body.curriculumWeek ? Number(req.body.curriculumWeek) : undefined,
        emailNotification: req.body.emailNotification,
        passageEmailAudience: req.body.passageEmailAudience ?? null
        ,passageGeneration: req.body.passageGeneration || {}
    });
    return res.status(201).json({ success: true, data: session });
});

export const getCurrentItem = asyncHandler(async (req, res) => {
    const result = await getCurrentSpellingItem({ schoolId: req.schoolId, sessionId: req.params.id });
    return res.status(200).json({ success: true, data: result });
});

export const recordAttempt = asyncHandler(async (req, res) => {
    const result = await recordSpellingAttempt({
        schoolId: req.schoolId,
        sessionId: req.params.id,
        userId: req.user._id,
        sequence: Number(req.body.sequence),
        correct: req.body.correct,
        studentInput: req.body.studentInput,
        idempotencyKey: req.body.idempotencyKey
    });
    return res.status(200).json({ success: true, data: result });
});

export const completeSession = asyncHandler(async (req, res) => {
    const result = await completeSpellingSession({
        schoolId: req.schoolId,
        sessionId: req.params.id,
        reason: req.body?.reason
    });
    return res.status(200).json({ success: true, data: result });
});

export const abandonSession = asyncHandler(async (req, res) => {
    const session = await abandonSpellingSession({ schoolId: req.schoolId, sessionId: req.params.id });
    return res.status(200).json({ success: true, data: session });
});
