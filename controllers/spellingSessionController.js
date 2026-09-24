import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import {
    abandonSpellingSession,
    completeSpellingSession,
    getCurrentSpellingItem,
    recordSpellingAttempt,
    startSpellingSession
} from '../services/spellingSessionService.js';

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
        emailNotification: req.body.emailNotification
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
