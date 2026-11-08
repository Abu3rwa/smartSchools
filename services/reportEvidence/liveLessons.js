import LiveSession from '../../models/LiveSession.js';
import LiveResponse from '../../models/LiveResponse.js';
import { liveAnswerCredit } from '../liveSessionGradebookService.js';
import { endOfDay } from './dateRange.js';

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
    if (endDate) dateFilter.$lte = endOfDay(endDate);
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

    const accuracy = markedCount > 0 ? Math.round((correctCount / markedCount) * 100) : null;
    const averageScore = markedCount > 0 ? Math.round((totalCredit / markedCount) * 100) : null;

    const uniqueSessions = new Set(responses.map(r => String(r.sessionId)));
    const participationRate = sessions.length > 0
        ? Math.round((uniqueSessions.size / sessions.length) * 100)
        : 0;

    // Responses have no guaranteed DB order; trend must compare chronologically.
    const sessionStart = new Map(sessions.map(s => [String(s._id), new Date(s.startedAt).getTime()]));
    const chronological = [...responses].sort(
        (a, b) => (sessionStart.get(String(a.sessionId)) || 0) - (sessionStart.get(String(b.sessionId)) || 0)
    );
    const half = Math.floor(chronological.length / 2);
    const olderHalf = chronological.slice(0, half);
    const newerHalf = chronological.slice(half);

    let olderCorrect = 0;
    let olderMarked = 0;
    for (const r of olderHalf) {
        const credit = liveAnswerCredit(r);
        if (credit === null) continue;
        olderMarked += 1;
        if (credit === 1) olderCorrect += 1;
    }

    let newerCorrect = 0;
    let newerMarked = 0;
    for (const r of newerHalf) {
        const credit = liveAnswerCredit(r);
        if (credit === null) continue;
        newerMarked += 1;
        if (credit === 1) newerCorrect += 1;
    }

    const olderPct = olderMarked > 0 ? (olderCorrect / olderMarked) * 100 : null;
    const newerPct = newerMarked > 0 ? (newerCorrect / newerMarked) * 100 : null;

    let trend = 'insufficient_data';
    if (responses.length >= 6 && olderPct !== null && newerPct !== null) {
        const diff = newerPct - olderPct;
        if (diff > 5) trend = 'improving';
        else if (diff < -5) trend = 'declining';
        else trend = 'stable';
    }

    const facts = [];
    facts.push(`Live sessions: ${uniqueSessions.size} of ${sessions.length} attended (${participationRate}%).`);
    facts.push(`Responses: ${responses.length} total, ${markedCount} marked.`);
    if (markedCount > 0) {
        facts.push(`Accuracy: ${accuracy}%. Average score: ${averageScore}%.`);
    }

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
