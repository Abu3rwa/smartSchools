import Student from '../models/Student.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingPassage from '../models/SpellingPassage.js';
import SpellingIntegrityEvent from '../models/SpellingIntegrityEvent.js';
import SpellingWord from '../models/SpellingWord.js';

const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

export async function resolveSpellingStudentId({ schoolId, requestedStudentId, user }) {
    if (user?.role !== 'student') return requestedStudentId || null;
    const student = await Student.findOne({ user: user._id, school: schoolId }).select('_id').lean();
    return student?._id || null;
}

export async function listSpellingSessions({ schoolId, studentId, studentIds, limit = 50, viewerRole = 'student' }) {
    const query = {
        school: schoolId,
        $or: [
            { status: 'in-progress' },
            { 'attempts.0': { $exists: true } }
        ]
    };
    if (studentId) {
        query.student = studentId;
    } else if (Array.isArray(studentIds) && studentIds.length) {
        query.student = { $in: studentIds };
    }
    const maxLimit = Array.isArray(studentIds) && studentIds.length > 1 ? 500 : 100;
    const sessions = await SpellingSession.find(query)
        .sort({ startedAt: -1 })
        .limit(Math.min(Math.max(Number(limit) || 50, 1), maxLimit))
        .select('student mode status startedAt completedAt completionReason retestDeadline correctCount mistakeCount attempts currentItem nextSequence curriculumGrade curriculumWeek emailNotification passageEmailAudience emailStatus emailSentAt emailAttempts emailError')
        .lean();
    if (viewerRole !== 'student') {
        const activeSessions = sessions.filter((session) => session.status === 'in-progress');
        const wordIds = activeSessions.map((session) => session.currentItem?.wordId).filter(Boolean);
        const retestIds = activeSessions.map((session) => session.currentItem?.retestItemId).filter(Boolean);
        const [words, retests] = await Promise.all([
            wordIds.length ? SpellingWord.find({ _id: { $in: wordIds }, school: schoolId }).select('_id word').lean() : [],
            retestIds.length ? SpellingRetestItem.find({ _id: { $in: retestIds }, school: schoolId }).select('_id wordSnapshot').lean() : []
        ]);
        const wordById = new Map(words.map((word) => [String(word._id), word.word]));
        const retestById = new Map(retests.map((item) => [String(item._id), item.wordSnapshot]));
        for (const session of activeSessions) {
            const current = session.currentItem;
            session.currentWord = current?.wordId
                ? wordById.get(String(current.wordId)) || null
                : current?.retestItemId
                    ? retestById.get(String(current.retestItemId)) || null
                    : null;
        }
    }
    const passages = await SpellingPassage.find({
        school: schoolId,
        session: { $in: sessions.map((session) => session._id) },
        ...(viewerRole === 'student' ? { status: { $in: ['approved', 'sent'] } } : {})
    }).select('_id session style missedWords content status generatedAt sentAt supersedes createdAt').sort({ createdAt: 1 }).lean();
    const passagesBySession = new Map();
    passages.forEach((passage) => {
        const key = String(passage.session);
        const versions = passagesBySession.get(key) || [];
        versions.push(passage);
        passagesBySession.set(key, versions);
    });
    return sessions.map((session) => {
        const practicePassages = passagesBySession.get(String(session._id)) || [];
        return {
            ...session,
            practicePassage: practicePassages[practicePassages.length - 1] || null,
            practicePassages,
            hasSentPassage: practicePassages.some((passage) => passage.status === 'sent')
        };
    });
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

export async function recordSpellingIntegrityEvent({ schoolId, studentId, sessionId, eventId, sequence, occurredAt }) {
    const session = await SpellingSession.findOne({
        _id: sessionId,
        school: schoolId,
        student: studentId,
        status: 'in-progress'
    }).select('_id nextSequence').lean();
    if (!session) throw notFound('Active spelling session not found');
    if (sequence != null && sequence > session.nextSequence) {
        throw Object.assign(new Error('sequence is beyond the active spelling item'), { statusCode: 400 });
    }

    const existingEvent = await SpellingIntegrityEvent.findOne({ school: schoolId, session: sessionId, eventId }).lean();
    if (!existingEvent) {
        const count = await SpellingIntegrityEvent.countDocuments({ school: schoolId, session: sessionId });
        if (count >= 500) throw Object.assign(new Error('Spelling session visibility event limit reached'), { statusCode: 429 });
        try {
            await SpellingIntegrityEvent.create({
                school: schoolId,
                student: studentId,
                session: sessionId,
                eventId,
                eventType: 'page_hidden',
                sequence: sequence || null,
                occurredAt: occurredAt || null,
                receivedAt: new Date()
            });
        } catch (error) {
            if (error.code !== 11000) throw error;
        }
    }

    const count = await SpellingIntegrityEvent.countDocuments({ school: schoolId, session: sessionId });
    const event = await SpellingIntegrityEvent.findOne({ school: schoolId, session: sessionId, eventId }).lean();
    return { event, count };
}

export async function listSpellingIntegrityEvents({ schoolId, sessionId }) {
    const query = { school: schoolId, session: sessionId };
    const [count, events] = await Promise.all([
        SpellingIntegrityEvent.countDocuments(query),
        SpellingIntegrityEvent.find(query).sort({ receivedAt: -1 }).limit(100).lean()
    ]);
    return { count, events };
}
