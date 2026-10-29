import crypto from 'crypto';
import {
    ANALYSIS_PROMPT_VERSION,
    MAX_MISSPELLING_SAMPLES,
    MIN_ATTEMPTS_FOR_RANKING,
    SPELLING_GRADES
} from '../utils/spellingAnalysisConfig.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const pct = (part, whole) => (whole ? Math.round((part / whole) * 10000) / 100 : 0);
const round1 = (value) => Math.round(value * 10) / 10;

export const monthKey = (value) => {
    const date = toDate(value);
    return date ? date.toISOString().slice(0, 7) : null;
};

/** Month windows run on UTC boundaries so a re-run of the same month is identical. */
export const windowRange = (window = {}) => {
    if (window?.kind === 'all') return { start: null, end: null };
    const key = String(window?.key || '');
    if (!/^\d{4}-\d{2}$/.test(key)) return { start: null, end: null };
    const start = new Date(`${key}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { start, end };
};

export const inRange = (value, range) => {
    if (!range?.start) return true;
    const date = toDate(value);
    return Boolean(date) && date >= range.start && date < range.end;
};

export const attemptTime = (attempt, session) => (
    toDate(attempt?.answeredAt)
    || toDate(session?.completedAt)
    || toDate(session?.startedAt)
);

const completedSessions = (sessions) => sessions.filter((session) => session.status === 'completed');

const attemptsOf = (sessions) => {
    const rows = [];
    for (const session of completedSessions(sessions)) {
        for (const attempt of session.attempts || []) {
            rows.push({ attempt, session, at: attemptTime(attempt, session) });
        }
    }
    return rows;
};

const breakdown = (rows, labelOf) => {
    const map = new Map();
    for (const row of rows) {
        const label = String(labelOf(row) || '').trim();
        if (!label) continue;
        const entry = map.get(label) || { label, attempts: 0, correct: 0, misses: 0 };
        entry.attempts += 1;
        if (row.attempt.correct) entry.correct += 1;
        else entry.misses += 1;
        map.set(label, entry);
    }
    return [...map.values()]
        .map((entry) => ({ ...entry, accuracy: pct(entry.correct, entry.attempts) }))
        .sort((left, right) => right.misses - left.misses || right.attempts - left.attempts || left.label.localeCompare(right.label));
};

const countRecurrences = (retests, range) => {
    const groups = new Map();
    for (const item of retests) {
        const key = String(item.wordSnapshot || '').trim().toLowerCase();
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    let recurrences = 0;
    for (const items of groups.values()) {
        items.sort((left, right) => toDate(left.flaggedAt) - toDate(right.flaggedAt));
        for (let index = 1; index < items.length; index += 1) {
            if (!inRange(items[index].flaggedAt, range)) continue;
            if (items.slice(0, index).some((item) => item.status === 'resolved')) recurrences += 1;
        }
    }
    return recurrences;
};

const trendOf = (months) => {
    const usable = months.filter((month) => month.attempts >= 10);
    if (usable.length < 2) return { direction: 'insufficient', delta: 0 };
    const previous = usable[usable.length - 2];
    const latest = usable[usable.length - 1];
    const delta = Math.round((latest.accuracy - previous.accuracy) * 10) / 10;
    if (delta >= 3) return { direction: 'improving', delta };
    if (delta <= -3) return { direction: 'declining', delta };
    return { direction: 'flat', delta };
};

/**
 * Every number on the analysis page comes from here. The AI only classifies
 * misspellings and writes prose — it never produces a statistic.
 */
export const buildStudentMetrics = ({
    sessions = [],
    retests = [],
    window = { kind: 'month', key: '' },
    now = new Date()
}) => {
    const range = windowRange(window);
    const beforeWindowEnd = (value) => {
        if (!range.start) return true;
        const date = toDate(value);
        return Boolean(date) && date < range.end;
    };

    const historySessions = sessions.filter((session) => beforeWindowEnd(session.startedAt));
    const scopedSessions = range.start
        ? historySessions.filter((session) => inRange(session.startedAt, range))
        : historySessions;
    const scopedCompleted = completedSessions(scopedSessions);
    const scopedAttempts = attemptsOf(scopedSessions);
    const answered = scopedAttempts.filter((row) => !row.attempt.skipped);
    const correct = answered.filter((row) => row.attempt.correct).length;
    const incorrect = answered.length - correct;
    const skipped = scopedAttempts.length - answered.length;

    const historyAttempts = attemptsOf(historySessions);
    const historyRetests = retests.filter((item) => beforeWindowEnd(item.flaggedAt));
    const scopedRetests = range.start
        ? historyRetests.filter((item) => inRange(item.flaggedAt, range))
        : historyRetests;

    const monthMap = new Map();
    const monthPoint = (key) => {
        if (!monthMap.has(key)) {
            monthMap.set(key, { key, attempts: 0, correct: 0, accuracy: 0, flagged: 0, resolved: 0, recoveryRate: 0 });
        }
        return monthMap.get(key);
    };
    for (const row of historyAttempts) {
        if (row.attempt.skipped) continue;
        const key = monthKey(row.at);
        if (!key) continue;
        const point = monthPoint(key);
        point.attempts += 1;
        if (row.attempt.correct) point.correct += 1;
    }
    for (const item of historyRetests) {
        const key = monthKey(item.flaggedAt);
        if (!key) continue;
        const point = monthPoint(key);
        point.flagged += 1;
        if (item.status === 'resolved') point.resolved += 1;
    }
    if (window.kind === 'month' && /^\d{4}-\d{2}$/.test(String(window.key || ''))) monthPoint(window.key);

    const months = [...monthMap.values()]
        .sort((left, right) => left.key.localeCompare(right.key))
        .slice(-12)
        .map((point) => ({
            ...point,
            accuracy: pct(point.correct, point.attempts),
            recoveryRate: pct(point.resolved, point.flagged)
        }));

    const statusCount = (status) => scopedRetests.filter((item) => item.status === status).length;
    const flagged = scopedRetests.length;
    const resolved = statusCount('resolved');
    const cleanResolved = scopedRetests.filter((item) => item.status === 'resolved' && !Number(item.incorrectRetestCount)).length;
    const recoveryDays = scopedRetests
        .filter((item) => item.status === 'resolved' && item.resolvedAt)
        .map((item) => (toDate(item.resolvedAt) - toDate(item.flaggedAt)) / DAY_MS)
        .filter((days) => Number.isFinite(days) && days >= 0);

    const missedWords = new Map();
    for (const row of scopedAttempts) {
        if (row.attempt.correct || row.attempt.skipped) continue;
        const word = String(row.attempt.wordSnapshot || '').trim();
        if (!word) continue;
        missedWords.set(word, (missedWords.get(word) || 0) + 1);
    }

    return {
        sessions: scopedSessions.length,
        completedSessions: scopedCompleted.length,
        abandonedSessions: scopedSessions.filter((session) => session.status === 'abandoned').length,
        attempts: scopedAttempts.length,
        correct,
        incorrect,
        skipped,
        accuracy: pct(correct, answered.length),
        skippedRate: pct(skipped, scopedAttempts.length),
        flagged,
        resolved,
        practiceMastered: statusCount('practice-mastered'),
        pending: statusCount('pending'),
        expired: statusCount('expired'),
        overdue: scopedRetests.filter((item) => (
            item.status === 'pending' && item.dueAt && toDate(item.dueAt) < now
        )).length,
        recoveryRate: pct(resolved, flagged),
        cleanRecoveryRate: pct(cleanResolved, resolved),
        averageRecoveryDays: recoveryDays.length ? round1(recoveryDays.reduce((sum, days) => sum + days, 0) / recoveryDays.length) : null,
        recurrence: countRecurrences(historyRetests, range),
        months,
        categories: breakdown(scopedAttempts, (row) => row.attempt.category),
        grades: breakdown(scopedAttempts, (row) => row.attempt.grade),
        weeks: breakdown(scopedAttempts, (row) => (
            row.attempt.week ? `${row.attempt.grade || ''} W${row.attempt.week}`.trim() : ''
        )),
        errorTypes: [],
        topMissedWords: [...missedWords.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, 10)
            .map(([word, misses]) => ({ word, misses })),
        trend: trendOf(months)
    };
};

/** The child's actual spelling next to the target word — the only raw text the AI sees. */
export const collectMisspellings = ({
    sessions = [],
    wordsById = new Map(),
    window = { kind: 'month', key: '' },
    max = MAX_MISSPELLING_SAMPLES
}) => {
    const range = windowRange(window);
    const scoped = range.start ? sessions.filter((session) => inRange(session.startedAt, range)) : sessions;
    const map = new Map();
    for (const row of attemptsOf(scoped)) {
        if (row.attempt.correct || row.attempt.skipped) continue;
        const word = wordsById.get(String(row.attempt.wordId));
        const target = String(word?.normalizedWord || row.attempt.wordSnapshot || '').trim();
        const input = String(row.attempt.normalizedInput || row.attempt.studentInput || '').trim();
        if (!target || !input) continue;
        const key = `${target}|${input}`;
        const entry = map.get(key) || { target, input, grade: row.attempt.grade || '', category: row.attempt.category || '', count: 0 };
        entry.count += 1;
        map.set(key, entry);
    }
    return [...map.values()]
        .sort((left, right) => right.count - left.count || left.target.localeCompare(right.target))
        .slice(0, max);
};

export const buildInputHash = ({ metrics, misspellings }) => {
    const signature = {
        version: ANALYSIS_PROMPT_VERSION,
        numbers: {
            attempts: metrics.attempts,
            correct: metrics.correct,
            incorrect: metrics.incorrect,
            skipped: metrics.skipped,
            flagged: metrics.flagged,
            resolved: metrics.resolved,
            practiceMastered: metrics.practiceMastered,
            pending: metrics.pending,
            expired: metrics.expired,
            recurrence: metrics.recurrence
        },
        months: metrics.months,
        topMissedWords: metrics.topMissedWords,
        misspellings
    };
    return crypto.createHash('sha256').update(JSON.stringify(signature)).digest('hex');
};

const rankRow = (analysis) => ({
    analysisId: String(analysis._id || ''),
    studentId: String(analysis.student || ''),
    studentName: analysis.studentName || '',
    classId: analysis.class ? String(analysis.class) : '',
    className: analysis.className || '',
    academicYear: analysis.academicYear || '',
    grade: analysis.grade || '',
    attempts: analysis.metrics?.attempts || 0,
    accuracy: analysis.metrics?.accuracy || 0,
    recoveryRate: analysis.metrics?.recoveryRate || 0,
    flagged: analysis.metrics?.flagged || 0,
    resolved: analysis.metrics?.resolved || 0,
    recommendation: analysis.recommendation || '',
    generatedAt: analysis.updatedAt || analysis.generatedAt || null
});

/** Ranking is per grade only and needs a minimum amount of evidence. */
export const rankAnalyses = (analyses = [], { minAttempts = MIN_ATTEMPTS_FOR_RANKING } = {}) => {
    const ready = analyses.filter((analysis) => analysis.status === 'ready');
    const eligible = ready
        .filter((analysis) => (analysis.metrics?.attempts || 0) >= minAttempts)
        .map(rankRow)
        .sort((left, right) => (
            right.accuracy - left.accuracy
            || right.recoveryRate - left.recoveryRate
            || right.attempts - left.attempts
            || left.studentName.localeCompare(right.studentName)
        ))
        .map((row, index) => ({ ...row, rank: index + 1 }));
    return {
        ranked: eligible,
        top: eligible.slice(0, 10),
        bottom: eligible.slice(-10).reverse(),
        unranked: ready
            .filter((analysis) => (analysis.metrics?.attempts || 0) < minAttempts)
            .map(rankRow)
            .map((row) => ({ ...row, reason: 'insufficient-data' })),
        minAttempts
    };
};

const pooledRows = (analyses) => analyses.reduce((acc, analysis) => ({
    attempts: acc.attempts + (analysis.metrics?.attempts || 0),
    correct: acc.correct + (analysis.metrics?.correct || 0),
    flagged: acc.flagged + (analysis.metrics?.flagged || 0),
    resolved: acc.resolved + (analysis.metrics?.resolved || 0)
}), { attempts: 0, correct: 0, flagged: 0, resolved: 0 });

/** Only sessions recorded against a class + academic year take part in class comparisons. */
export const compareClasses = (analyses = []) => {
    const groups = new Map();
    for (const analysis of analyses) {
        if (analysis.status !== 'ready' || !analysis.class || !analysis.academicYear) continue;
        const key = `${analysis.class}|${analysis.academicYear}`;
        if (!groups.has(key)) {
            groups.set(key, {
                classId: String(analysis.class),
                className: analysis.className || '',
                academicYear: analysis.academicYear,
                grade: analysis.grade || '',
                students: 0,
                analyses: []
            });
        }
        const group = groups.get(key);
        group.students += 1;
        group.analyses.push(analysis);
    }
    return [...groups.values()]
        .map(({ analyses: groupAnalyses, ...group }) => {
            const pooled = pooledRows(groupAnalyses);
            return {
                ...group,
                attempts: pooled.attempts,
                accuracy: pct(pooled.correct, pooled.attempts),
                flagged: pooled.flagged,
                resolved: pooled.resolved,
                recoveryRate: pct(pooled.resolved, pooled.flagged)
            };
        })
        .sort((left, right) => right.accuracy - left.accuracy || left.className.localeCompare(right.className));
};

export const compareGrades = (analyses = []) => {
    const groups = new Map();
    for (const analysis of analyses) {
        if (analysis.status !== 'ready' || !analysis.grade) continue;
        if (!groups.has(analysis.grade)) groups.set(analysis.grade, []);
        groups.get(analysis.grade).push(analysis);
    }
    return [...groups.entries()]
        .map(([grade, groupAnalyses]) => {
            const pooled = pooledRows(groupAnalyses);
            return {
                grade,
                students: groupAnalyses.length,
                attempts: pooled.attempts,
                accuracy: pct(pooled.correct, pooled.attempts),
                flagged: pooled.flagged,
                resolved: pooled.resolved,
                recoveryRate: pct(pooled.resolved, pooled.flagged)
            };
        })
        .sort((left, right) => SPELLING_GRADES.indexOf(left.grade) - SPELLING_GRADES.indexOf(right.grade));
};
