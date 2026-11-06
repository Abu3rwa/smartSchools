import SpellingSession from '../../models/SpellingSession.js';
import SpellingRetestItem from '../../models/SpellingRetestItem.js';
import { endOfDay } from './dateRange.js';

/**
 * Evidence collector for spelling.
 * Queries SpellingSession and SpellingRetestItem directly.
 */
export async function collect({ schoolId, studentId, startDate, endDate }) {
    const sessionQuery = {
        school: schoolId,
        student: studentId,
        status: { $ne: 'abandoned' },
        'attempts.0': { $exists: true }
    };

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = endOfDay(endDate);
    if (Object.keys(dateFilter).length > 0) sessionQuery.startedAt = dateFilter;

    const [sessions, retestItems] = await Promise.all([
        SpellingSession.find(sessionQuery).sort({ startedAt: 1 }).lean(),
        SpellingRetestItem.find({
            school: schoolId,
            student: studentId
        }).lean()
    ]);

    if (sessions.length === 0) {
        return {
            source: 'spelling',
            available: false,
            recordCount: 0,
            metrics: {},
            facts: [],
            trend: 'insufficient_data'
        };
    }

    const completedSessions = sessions.filter(s => s.status === 'completed');
    const allAttempts = sessions.flatMap(s => s.attempts || []);
    const correctCount = allAttempts.filter(a => a.correct).length;
    const incorrectCount = allAttempts.filter(a => !a.correct && !a.skipped).length;
    const accuracy = allAttempts.length > 0
        ? Math.round((correctCount / allAttempts.length) * 100)
        : 0;

    const pendingRetests = retestItems.filter(r => r.status === 'pending');
    const resolvedRetests = retestItems.filter(r =>
        r.status === 'resolved' || r.status === 'practice-mastered'
    );

    const uniqueMissedWords = new Set(
        allAttempts
            .filter(a => !a.correct && !a.skipped)
            .map(a => String(a.wordId || `${a.grade}:${a.week}:${a.wordSnapshot}`))
    );

    const recoveredWords = new Set(
        allAttempts
            .filter(a => a.correct && a.isRetest && a.retestItemId)
            .map(a => String(a.retestItemId))
    );

    const recoveryRate = uniqueMissedWords.size > 0
        ? Math.round((recoveredWords.size / uniqueMissedWords.size) * 100)
        : 0;

    const half = Math.floor(sessions.length / 2);
    const firstSessions = sessions.slice(0, half || 1);
    const secondSessions = sessions.slice(half || 1);

    const firstAccuracy = firstSessions.length > 0
        ? firstSessions.flatMap(s => s.attempts || [])
        : [];
    const secondAccuracy = secondSessions.length > 0
        ? secondSessions.flatMap(s => s.attempts || [])
        : [];

    const firstPct = firstAccuracy.length > 0
        ? Math.round((firstAccuracy.filter(a => a.correct).length / firstAccuracy.length) * 100)
        : 0;
    const secondPct = secondAccuracy.length > 0
        ? Math.round((secondAccuracy.filter(a => a.correct).length / secondAccuracy.length) * 100)
        : 0;

    let trend = 'stable';
    if (sessions.length >= 4) {
        const diff = secondPct - firstPct;
        if (diff > 5) trend = 'improving';
        else if (diff < -5) trend = 'declining';
    }

    const facts = [];
    facts.push(`Spelling sessions: ${sessions.length} total, ${completedSessions.length} completed.`);
    facts.push(`Overall accuracy: ${accuracy}% (${correctCount} correct, ${incorrectCount} incorrect).`);
    facts.push(`Unique words missed: ${uniqueMissedWords.size}. Recovery rate: ${recoveryRate}%.`);
    facts.push(`Pending retests: ${pendingRetests.length}. Resolved: ${resolvedRetests.length}.`);

    return {
        source: 'spelling',
        available: true,
        recordCount: sessions.length,
        metrics: {
            totalSessions: sessions.length,
            completedSessions: completedSessions.length,
            accuracy,
            correctCount,
            incorrectCount,
            uniqueMissedWords: uniqueMissedWords.size,
            pendingRetests: pendingRetests.length,
            resolvedRetests: resolvedRetests.length,
            recoveryRate
        },
        facts,
        trend
    };
}
