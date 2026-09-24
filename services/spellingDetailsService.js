import Student from '../models/Student.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';

const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

const roundPercentage = (correct, total) => total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;

const buildEmptyGrade = (grade) => ({
    grade,
    originalAttempts: 0,
    originalCorrect: 0,
    originalIncorrect: 0,
    uniqueWordsEverMissed: 0,
    retestAttempts: 0,
    retestCorrect: 0,
    retestIncorrect: 0,
    pendingRetests: 0,
    accuracy: 0,
    firstAttemptAt: null,
    lastAttemptAt: null
});

export async function buildStudentSpellingDetails({ schoolId, studentId, grade, from, to }) {
    const student = await Student.findOne({ school: schoolId, _id: studentId })
        .select('studentId firstName lastName spelling')
        .lean();
    if (!student) throw notFound('Student not found');

    const sessionQuery = {
        school: schoolId,
        student: studentId,
        status: { $ne: 'abandoned' },
        'attempts.0': { $exists: true }
    };
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(`${to}T23:59:59.999Z`);
    if (Object.keys(dateFilter).length > 0) sessionQuery.startedAt = dateFilter;

    const [sessions, pendingRetests] = await Promise.all([
        SpellingSession.find(sessionQuery).sort({ startedAt: 1 }).lean(),
        SpellingRetestItem.find({ school: schoolId, student: studentId, status: 'pending' }).lean()
    ]);

    const attempts = sessions.flatMap((session) => (session.attempts || []).map((attempt) => ({
        ...attempt,
        sessionStartedAt: session.startedAt,
        sessionId: session._id
    })));
    const filteredAttempts = grade ? attempts.filter((attempt) => attempt.grade === String(grade).toUpperCase()) : attempts;
    const originalAttempts = filteredAttempts.filter((attempt) => !attempt.isRetest);
    const retestAttempts = filteredAttempts.filter((attempt) => attempt.isRetest);
    const missedWordKeys = new Set(originalAttempts.filter((attempt) => !attempt.correct).map((attempt) => String(attempt.wordId || `${attempt.grade}:${attempt.week}:${attempt.wordSnapshot}`)));
    const retestByWord = new Map();

    for (const attempt of retestAttempts) {
        const key = String(attempt.wordId || `${attempt.grade}:${attempt.week}:${attempt.wordSnapshot}`);
        const current = retestByWord.get(key) || { retestAttempts: 0, retestCorrect: 0, retestIncorrect: 0 };
        current.retestAttempts += 1;
        if (attempt.correct) current.retestCorrect += 1;
        else current.retestIncorrect += 1;
        retestByWord.set(key, current);
    }

    const byGradeMap = new Map();
    for (const attempt of filteredAttempts) {
        const row = byGradeMap.get(attempt.grade) || buildEmptyGrade(attempt.grade);
        const timestamp = new Date(attempt.answeredAt || attempt.sessionStartedAt);
        row.firstAttemptAt = row.firstAttemptAt && row.firstAttemptAt < timestamp ? row.firstAttemptAt : timestamp;
        row.lastAttemptAt = row.lastAttemptAt && row.lastAttemptAt > timestamp ? row.lastAttemptAt : timestamp;
        if (attempt.isRetest) {
            row.retestAttempts += 1;
            if (attempt.correct) row.retestCorrect += 1;
            else row.retestIncorrect += 1;
        } else {
            row.originalAttempts += 1;
            if (attempt.correct) row.originalCorrect += 1;
            else row.originalIncorrect += 1;
        }
        byGradeMap.set(attempt.grade, row);
    }

    const gradePendingCounts = pendingRetests.reduce((counts, item) => {
        if (!grade || item.grade === String(grade).toUpperCase()) counts[item.grade] = (counts[item.grade] || 0) + 1;
        return counts;
    }, {});
    const byGrade = [...byGradeMap.values()].map((row) => ({
        ...row,
        uniqueWordsEverMissed: new Set(originalAttempts.filter((attempt) => attempt.grade === row.grade && !attempt.correct).map((attempt) => String(attempt.wordId || `${attempt.grade}:${attempt.week}:${attempt.wordSnapshot}`))).size,
        pendingRetests: gradePendingCounts[row.grade] || 0,
        accuracy: roundPercentage(row.originalCorrect, row.originalAttempts)
    }));

    const timelineMap = new Map();
    for (const attempt of filteredAttempts) {
        const date = new Date(attempt.answeredAt || attempt.sessionStartedAt).toISOString().slice(0, 10);
        const key = `${date}:${attempt.grade}:${attempt.week}`;
        const row = timelineMap.get(key) || { date, grade: attempt.grade, week: attempt.week, originalAttempts: 0, originalCorrect: 0, originalIncorrect: 0, retestAttempts: 0, retestCorrect: 0, retestIncorrect: 0 };
        if (attempt.isRetest) {
            row.retestAttempts += 1;
            if (attempt.correct) row.retestCorrect += 1;
            else row.retestIncorrect += 1;
        } else {
            row.originalAttempts += 1;
            if (attempt.correct) row.originalCorrect += 1;
            else row.originalIncorrect += 1;
        }
        timelineMap.set(key, row);
    }

    const missedWords = new Map();
    for (const attempt of filteredAttempts.filter((item) => !item.isRetest && !item.correct)) {
        const key = String(attempt.wordId || `${attempt.grade}:${attempt.week}:${attempt.wordSnapshot}`);
        const current = missedWords.get(key) || { word: attempt.wordSnapshot, grade: attempt.grade, firstMissedAt: attempt.answeredAt || attempt.sessionStartedAt, originalIncorrectCount: 0, retestAttempts: 0, retestCorrect: 0, pending: false };
        current.originalIncorrectCount += 1;
        missedWords.set(key, current);
    }
    for (const item of filteredAttempts.filter((attempt) => attempt.isRetest)) {
        const key = String(item.wordId || `${item.grade}:${item.week}:${item.wordSnapshot}`);
        const current = missedWords.get(key);
        if (current) {
            current.retestAttempts += 1;
            if (item.correct) current.retestCorrect += 1;
        }
    }
    for (const item of pendingRetests) {
        const key = String(item.sourceWord || `${item.grade}:${item.week}:${item.wordSnapshot}`);
        const current = missedWords.get(key);
        if (current) current.pending = true;
    }

    const totalOriginal = originalAttempts.length;
    const totalRetest = retestAttempts.length;
    const retestCorrect = retestAttempts.filter((attempt) => attempt.correct).length;
    return {
        student: {
            id: student._id,
            studentId: student.studentId,
            firstName: student.firstName,
            lastName: student.lastName,
            currentGrade: student.spelling?.currentGrade || null,
            currentWeek: student.spelling?.currentWeek || null,
            lastWordIndex: student.spelling?.lastWordIndex || 0
        },
        summary: {
            originalAttempts: totalOriginal,
            originalCorrect: originalAttempts.filter((attempt) => attempt.correct).length,
            originalIncorrect: originalAttempts.filter((attempt) => !attempt.correct).length,
            uniqueWordsEverMissed: missedWordKeys.size,
            retestAttempts: totalRetest,
            retestCorrect,
            retestIncorrect: totalRetest - retestCorrect,
            pendingRetests: pendingRetests.length,
            overdueRetests: pendingRetests.filter((item) => item.dueAt && new Date(item.dueAt) < new Date()).length,
            originalAccuracy: roundPercentage(originalAttempts.filter((attempt) => attempt.correct).length, totalOriginal),
            retestRecoveryRate: roundPercentage(retestCorrect, totalRetest)
        },
        byGrade,
        timeline: [...timelineMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
        missedWords: [...missedWords.values()].sort((a, b) => b.originalIncorrectCount - a.originalIncorrectCount)
    };
}
