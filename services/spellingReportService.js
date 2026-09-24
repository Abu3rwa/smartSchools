import Class from '../models/Class.js';
import Student from '../models/Student.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';

export async function buildSpellingDashboard({ schoolId, classId }) {
    let studentIds = null;
    if (classId) {
        const students = await Student.find({ school: schoolId, currentClass: classId }).select('_id').lean();
        studentIds = students.map((student) => student._id);
    }
    const sessionQuery = { school: schoolId, status: 'completed' };
    const retestQuery = { school: schoolId, status: 'pending' };
    if (studentIds) {
        sessionQuery.student = { $in: studentIds };
        retestQuery.student = { $in: studentIds };
    }
    const [sessions, retests] = await Promise.all([
        SpellingSession.find(sessionQuery).select('student startedAt correctCount mistakeCount attempts').lean(),
        SpellingRetestItem.find(retestQuery).select('student wordSnapshot dueAt flaggedAt').lean()
    ]);
    const totalCorrect = sessions.reduce((sum, session) => sum + session.correctCount, 0);
    const totalMistakes = sessions.reduce((sum, session) => sum + session.mistakeCount, 0);
    const missedWords = new Map();
    sessions.flatMap((session) => session.attempts || []).filter((attempt) => !attempt.correct).forEach((attempt) => {
        missedWords.set(attempt.wordSnapshot, (missedWords.get(attempt.wordSnapshot) || 0) + 1);
    });
    return {
        totals: {
            sessions: sessions.length,
            correct: totalCorrect,
            incorrect: totalMistakes,
            accuracy: totalCorrect + totalMistakes ? Math.round((totalCorrect / (totalCorrect + totalMistakes)) * 10000) / 100 : 0,
            pendingRetests: retests.length
        },
        mostMissedWords: [...missedWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([word, misses]) => ({ word, misses })),
        upcomingRetests: retests.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt)).slice(0, 50)
    };
}

export async function buildStudentSpellingReport({ schoolId, studentId }) {
    const [student, sessions, retests] = await Promise.all([
        Student.findOne({ _id: studentId, school: schoolId }).select('firstName lastName studentId').lean(),
        SpellingSession.find({ school: schoolId, student: studentId }).sort({ startedAt: -1 }).lean(),
        SpellingRetestItem.find({ school: schoolId, student: studentId, status: 'pending' }).sort({ dueAt: 1 }).lean()
    ]);
    return { student, sessions, retests };
}

export async function buildClassSpellingReport({ schoolId, classId }) {
    const schoolClass = await Class.findOne({ _id: classId, school: schoolId }).lean();
    const students = await Student.find({ school: schoolId, currentClass: classId }).select('_id firstName lastName studentId').lean();
    const studentIds = students.map((student) => student._id);
    const sessions = await SpellingSession.find({ school: schoolId, student: { $in: studentIds }, status: 'completed' }).select('student correctCount mistakeCount').lean();
    const rows = students.map((student) => {
        const studentSessions = sessions.filter((session) => String(session.student) === String(student._id));
        const correct = studentSessions.reduce((sum, session) => sum + session.correctCount, 0);
        const incorrect = studentSessions.reduce((sum, session) => sum + session.mistakeCount, 0);
        return { ...student, sessions: studentSessions.length, correct, incorrect, accuracy: correct + incorrect ? Math.round((correct / (correct + incorrect)) * 10000) / 100 : 0 };
    });
    return { class: schoolClass, rows };
}
