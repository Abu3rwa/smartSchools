import { asyncHandler } from '../middleware/errorHandler.js';
import {
    getSpellingSession,
    getActiveSpellingSession,
    listSpellingRetests,
    listSpellingSessions,
    resolveSpellingStudentId
} from '../services/spellingReadService.js';

const studentIdForRequest = (req) => resolveSpellingStudentId({
    schoolId: req.schoolId,
    requestedStudentId: req.query.studentId || req.params.studentId,
    user: req.user
});

export const listSessions = asyncHandler(async (req, res) => {
    let studentIds = null;
    let studentId = null;

    if (req.query.studentIds && ['admin', 'department_principal', 'teacher'].includes(req.user?.role)) {
        const rawIds = Array.isArray(req.query.studentIds)
            ? req.query.studentIds
            : String(req.query.studentIds).split(',').map((s) => s.trim()).filter(Boolean);
        if (rawIds.length > 0) {
            studentIds = rawIds;
        }
    }

    if (!studentIds) {
        studentId = await studentIdForRequest(req);
    }

    const sessions = await listSpellingSessions({
        schoolId: req.schoolId,
        studentId,
        studentIds,
        limit: req.query.limit || (studentIds ? 300 : 50),
        viewerRole: req.user?.role
    });
    return res.json({ success: true, data: sessions });
});

export const getSession = asyncHandler(async (req, res) => {
    const studentId = await studentIdForRequest(req);
    const session = await getSpellingSession({ schoolId: req.schoolId, sessionId: req.params.id, studentId });
    return res.json({ success: true, data: session });
});

export const getActiveSession = asyncHandler(async (req, res) => {
    const studentId = await studentIdForRequest(req);
    if (!studentId) return res.status(400).json({ success: false, message: 'Student context required' });
    const session = await getActiveSpellingSession({ schoolId: req.schoolId, studentId });
    return res.json({ success: true, data: session });
});

export const listRetests = asyncHandler(async (req, res) => {
    const studentId = await studentIdForRequest(req);
    if (!studentId) return res.status(400).json({ success: false, message: 'Student context required' });
    const items = await listSpellingRetests({
        schoolId: req.schoolId,
        studentId,
        includeResolved: req.query.includeResolved === 'true',
        limit: req.query.limit
    });
    return res.json({ success: true, data: items });
});
