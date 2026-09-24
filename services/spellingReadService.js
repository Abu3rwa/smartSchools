import Student from '../models/Student.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';

const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

export async function resolveSpellingStudentId({ schoolId, requestedStudentId, user }) {
    if (user?.role !== 'student') return requestedStudentId || null;
    const student = await Student.findOne({ user: user._id, school: schoolId }).select('_id').lean();
    return student?._id || null;
}

export async function listSpellingSessions({ schoolId, studentId, limit = 50 }) {
    const query = {
        school: schoolId,
        $or: [
            { status: 'in-progress' },
            { 'attempts.0': { $exists: true } }
        ]
    };
    if (studentId) query.student = studentId;
    return SpellingSession.find(query)
        .sort({ startedAt: -1 })
        .limit(Math.min(Math.max(Number(limit) || 50, 1), 100))
        .select('student mode status startedAt completedAt completionReason retestDeadline correctCount mistakeCount attempts')
        .lean();
}

export async function getActiveSpellingSession({ schoolId, studentId }) {
    return SpellingSession.findOne({
        school: schoolId,
        student: studentId,
        status: 'in-progress'
    }).sort({ startedAt: -1 }).lean();
}

export async function getSpellingSession({ schoolId, sessionId, studentId }) {
    const query = { _id: sessionId, school: schoolId };
    if (studentId) query.student = studentId;
    const session = await SpellingSession.findOne(query).lean();
    if (!session) throw notFound('Spelling session not found');
    return session;
}

export async function listSpellingRetests({ schoolId, studentId, includeResolved = false, limit = 100 }) {
    const query = { school: schoolId, student: studentId };
    if (!includeResolved) query.status = 'pending';
    return SpellingRetestItem.find(query)
        .sort({ status: 1, dueAt: 1, flaggedAt: 1 })
        .limit(Math.min(Math.max(Number(limit) || 100, 1), 200))
        .lean();
}
