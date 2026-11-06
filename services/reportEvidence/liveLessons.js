import LiveSession from '../../models/LiveSession.js';
import LiveResponse from '../../models/LiveResponse.js';
import { liveAnswerCredit } from '../liveSessionGradebookService.js';

/**
 * Evidence collector for live lessons.
 * Queries LiveSession and LiveResponse for student participation and performance.
 */
export async function collect({ schoolId, studentId, startDate, endDate, classId }) {
    const sessionQuery = {
        school: schoolId,
        status: 'ended'
    };

    if (classId) sessionQuery.classId = classId;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(`${endDate}T23:59:59.999Z`);
    if (Object.keys(dateFilter).length > 0) sessionQuery.startedAt = dateFilter;

    const sessions = await LiveSession.find(sessionQuery).sort({ startedAt: -1 }).lean();

    if (sessions.length === 0) {
        return {
            source: 'liveLessons',
            available: false,
            recordCount: 0,
            metrics: {},
            facts: [],
            trend: 'insufficient_data'
        };
    }

    const sessionIds = sessions.map(s => s._id);
    const responses = await LiveResponse.find({
        school: schoolId,
        sessionId: { $in: sessionIds },
        studentId: studentId
    }).lean();

    if (responses.length === 0) {
        return {
            source: 'liveLessons',
            available: false,
            recordCount: 0,
            metrics: { sessionsAvailable: sessions.length },
            facts: [`Student did not participate in ${sessions.length} live sessions during this period.`],
            trend: 'insufficient_data'
        };
    }

    let totalCredit = 0;
    let markedCount = 0;
    let correctCount = 0;

    for (const response of responses) {
        const credit = liveAnswerCredit(response);
        if (credit === null) continue;
        markedCount += 1;
        totalCredit += credit;
        if (credit === 1) correctCount += 1;
    }

    const accuracy = markedCount > 0 ? Math.round((correctCount / markedCount) * 100) : 0;
    const averageScore = markedCount > 0 ? Math.round((totalCredit / markedCount) * 100) : 0;

    const uniqueSessions = new Set(responses.map(r => String(r.sessionId)));
    const participationRate = sessions.length > 0
        ? Math.round((uniqueSessions.size / sessions.length) * 100)
        : 0;

    const half = Math.floor(responses.length / 2);
    const firstHalf = responses.slice(half);
    const secondHalf = responses.slice(0, half);

    let firstCorrect = 0;
    let firstMarked = 0;
    for (const r of firstHalf) {
        const credit = liveAnswerCredit(r);
        if (credit === null) continue;
        firstMarked += 1;
        if (credit === 1) firstCorrect += 1;
    }

    let secondCorrect = 0;
    let secondMarked = 0;
    for (const r of secondHalf) {
        const credit = liveAnswerCredit(r);
        if (credit === null) continue;
        secondMarked += 1;
        if (credit === 1) secondCorrect += 1;
    }

    const firstPct = firstMarked > 0 ? Math.round((firstCorrect / firstMarked) * 100) : 0;
    const secondPct = secondMarked > 0 ? Math.round((secondCorrect / secondMarked) * 100) : 0;

    let trend = 'stable';
    if (responses.length >= 6) {
        const diff = secondPct - firstPct;
        if (diff > 5) trend = 'improving';
        else if (diff < -5) trend = 'declining';
    }

    const facts = [];
    facts.push(`Live sessions: ${uniqueSessions.size} of ${sessions.length} attended (${participationRate}%).`);
    facts.push(`Responses: ${responses.length} total, ${markedCount} marked.`);
    facts.push(`Accuracy: ${accuracy}%. Average score: ${averageScore}%.`);

    return {
        source: 'liveLessons',
        available: true,
        recordCount: responses.length,
        metrics: {
            sessionsAttended: uniqueSessions.size,
            sessionsAvailable: sessions.length,
            participationRate,
            totalResponses: responses.length,
            markedResponses: markedCount,
            accuracy,
            averageScore
        },
        facts,
        trend
    };
}
