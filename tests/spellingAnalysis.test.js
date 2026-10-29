import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildInputHash,
    buildStudentMetrics,
    collectMisspellings,
    compareClasses,
    rankAnalyses
} from '../services/spellingAnalysisMetrics.js';
import { normalizeAnalysis } from '../services/spellingAnalysisAIService.js';

const at = (iso) => new Date(iso);

const attempt = (overrides = {}) => ({
    wordId: 'w1',
    wordSnapshot: 'because',
    grade: 'G3',
    week: 2,
    category: 'Vowel teams',
    correct: true,
    skipped: false,
    answeredAt: at('2026-10-05T10:00:00Z'),
    ...overrides
});

const session = (startedAt, attempts, overrides = {}) => ({
    _id: `s-${startedAt}`,
    student: 'student-1',
    status: 'completed',
    startedAt: at(startedAt),
    completedAt: at(startedAt),
    attempts,
    ...overrides
});

const retest = (overrides = {}) => ({
    wordSnapshot: 'because',
    flaggedAt: at('2026-10-02T09:00:00Z'),
    dueAt: at('2026-11-02T09:00:00Z'),
    status: 'pending',
    resolvedAt: null,
    incorrectRetestCount: 0,
    ...overrides
});

const analysis = (overrides = {}) => ({
    _id: 'analysis-1',
    student: 'student-1',
    studentName: 'Nour Haddad',
    class: 'class-a',
    className: 'Grade 3 - A',
    academicYear: '2026-2027',
    grade: 'G3',
    status: 'ready',
    metrics: { attempts: 40, correct: 32, accuracy: 80, recoveryRate: 50, flagged: 10, resolved: 5 },
    recommendation: 'Practise vowel teams.',
    ...overrides
});

test('accuracy ignores skipped words but still counts them', () => {
    const sessions = [session('2026-10-04T09:00:00Z', [
        attempt({ correct: true }),
        attempt({ wordId: 'w2', correct: false, wordSnapshot: 'said', normalizedInput: 'sed' }),
        attempt({ wordId: 'w3', skipped: true, correct: false, wordSnapshot: 'friend' })
    ])];
    const metrics = buildStudentMetrics({ sessions, retests: [], window: { kind: 'month', key: '2026-10' } });
    assert.equal(metrics.attempts, 3);
    assert.equal(metrics.correct, 1);
    assert.equal(metrics.incorrect, 1);
    assert.equal(metrics.skipped, 1);
    assert.equal(metrics.accuracy, 50);
    assert.equal(metrics.skippedRate, 33.33);
});

test('a month window scopes the headline but keeps earlier months for the trend', () => {
    const sessions = [
        session('2026-09-10T09:00:00Z', [attempt({ answeredAt: at('2026-09-10T10:00:00Z') })]),
        session('2026-10-10T09:00:00Z', [
            attempt({ answeredAt: at('2026-10-10T10:00:00Z') }),
            attempt({ wordId: 'w2', wordSnapshot: 'said', correct: false, answeredAt: at('2026-10-10T10:05:00Z') })
        ])
    ];
    const metrics = buildStudentMetrics({ sessions, retests: [], window: { kind: 'month', key: '2026-10' } });
    assert.equal(metrics.attempts, 2);
    assert.equal(metrics.sessions, 1);
    assert.deepEqual(metrics.months.map((month) => month.key), ['2026-09', '2026-10']);
    assert.equal(metrics.months[0].accuracy, 100);
    assert.equal(metrics.months[1].accuracy, 50);
    assert.equal(metrics.trend.direction, 'insufficient');
});

test('recovery rate, clean recoveries, days to recovery and overdue backlog', () => {
    const retests = [
        retest({
            wordSnapshot: 'because',
            status: 'resolved',
            resolvedAt: at('2026-10-07T09:00:00Z'),
            incorrectRetestCount: 0
        }),
        retest({
            wordSnapshot: 'friend',
            status: 'resolved',
            flaggedAt: at('2026-10-04T09:00:00Z'),
            resolvedAt: at('2026-10-14T09:00:00Z'),
            incorrectRetestCount: 2
        }),
        retest({
            wordSnapshot: 'said',
            status: 'pending',
            flaggedAt: at('2026-10-05T09:00:00Z'),
            dueAt: at('2026-10-20T09:00:00Z')
        })
    ];
    const metrics = buildStudentMetrics({
        sessions: [],
        retests,
        window: { kind: 'month', key: '2026-10' },
        now: at('2026-10-29T00:00:00Z')
    });
    assert.equal(metrics.flagged, 3);
    assert.equal(metrics.resolved, 2);
    assert.equal(metrics.pending, 1);
    assert.equal(metrics.overdue, 1);
    assert.equal(metrics.recoveryRate, 66.67);
    assert.equal(metrics.cleanRecoveryRate, 50);
    assert.equal(metrics.averageRecoveryDays, 7.5);
});

test('a resolved word that is flagged again counts as recurrence', () => {
    const retests = [
        retest({ flaggedAt: at('2026-10-02T09:00:00Z'), status: 'resolved', resolvedAt: at('2026-10-06T09:00:00Z') }),
        retest({ wordSnapshot: 'Because', flaggedAt: at('2026-10-18T09:00:00Z'), status: 'pending' })
    ];
    const metrics = buildStudentMetrics({ sessions: [], retests, window: { kind: 'month', key: '2026-10' } });
    assert.equal(metrics.recurrence, 1);
});

test('ranking is per grade evidence and puts the least accurate students last', () => {
    const rows = [
        analysis({ _id: 'a', studentName: 'High', metrics: { attempts: 40, accuracy: 92, recoveryRate: 80, flagged: 5, resolved: 4 } }),
        analysis({ _id: 'b', studentName: 'Low', metrics: { attempts: 40, accuracy: 55, recoveryRate: 20, flagged: 10, resolved: 2 } }),
        analysis({ _id: 'c', studentName: 'Middle', metrics: { attempts: 40, accuracy: 74, recoveryRate: 50, flagged: 8, resolved: 4 } }),
        analysis({ _id: 'd', studentName: 'Too few', metrics: { attempts: 5, accuracy: 100, recoveryRate: 100, flagged: 0, resolved: 0 } })
    ];
    const ranking = rankAnalyses(rows, { minAttempts: 20 });
    assert.deepEqual(ranking.ranked.map((row) => row.studentName), ['High', 'Middle', 'Low']);
    assert.deepEqual(ranking.bottom.map((row) => row.studentName), ['Low', 'Middle', 'High']);
    assert.equal(ranking.unranked[0].studentName, 'Too few');
    assert.equal(ranking.unranked[0].reason, 'insufficient-data');
});

test('class comparison needs a class and an academic year, and pools raw counts', () => {
    const rows = [
        analysis({ _id: 'a', class: 'class-a', academicYear: '2026-2027', metrics: { attempts: 10, correct: 8, accuracy: 80, flagged: 4, resolved: 2, recoveryRate: 50 } }),
        analysis({ _id: 'b', class: 'class-a', academicYear: '2026-2027', metrics: { attempts: 30, correct: 18, accuracy: 60, flagged: 6, resolved: 3, recoveryRate: 50 } }),
        analysis({ _id: 'c', class: null, academicYear: null })
    ];
    const classes = compareClasses(rows);
    assert.equal(classes.length, 1);
    assert.equal(classes[0].students, 2);
    assert.equal(classes[0].attempts, 40);
    assert.equal(classes[0].accuracy, 65);
    assert.equal(classes[0].recoveryRate, 50);
});

test('misspelling samples use the target word and drop correct or skipped attempts', () => {
    const sessions = [session('2026-10-04T09:00:00Z', [
        attempt({ wordId: 'w1', wordSnapshot: 'because', correct: false, normalizedInput: 'becos' }),
        attempt({ wordId: 'w1', wordSnapshot: 'because', correct: false, normalizedInput: 'becos' }),
        attempt({ wordId: 'w1', wordSnapshot: 'because', correct: true }),
        attempt({ wordId: 'w2', wordSnapshot: 'friend', skipped: true, correct: false, studentInput: 'frend' })
    ])];
    const wordsById = new Map([['w1', { normalizedWord: 'because' }], ['w2', { normalizedWord: 'friend' }]]);
    const rows = collectMisspellings({ sessions, wordsById, window: { kind: 'month', key: '2026-10' } });
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { target: 'because', input: 'becos', grade: 'G3', category: 'Vowel teams', count: 2 });
});

test('AI output is clamped to the fixed taxonomy and the real mistake budget', () => {
    const result = normalizeAnalysis({
        errorTypes: [
            { type: 'phonetic', count: 4, examples: ['because → becos'] },
            { type: 'made-up-type', count: 2, examples: ['friend → frend'] },
            { type: 'omission', count: 9, examples: [] }
        ],
        strengths: ['Knows short words'],
        gaps: ['Vowel teams'],
        recommendation: 'Drill vowel teams twice this week.',
        narrative: 'Steady progress on short words.'
    }, { incorrect: 5 });
    assert.equal(result.ok, true);
    assert.equal(result.fields.errorTypes.reduce((sum, row) => sum + row.count, 0), 5);
    assert.deepEqual(result.fields.errorTypes.map((row) => row.type).sort(), ['other', 'phonetic']);
    assert.equal(result.fields.errorTypes.find((row) => row.type === 'phonetic').share, 80);
});

test('an unusable AI reply is rejected', () => {
    const result = normalizeAnalysis({}, { incorrect: 3 });
    assert.equal(result.ok, false);
});

test('input hash is stable until the misspellings change', () => {
    const metrics = buildStudentMetrics({ sessions: [], retests: [], window: { kind: 'month', key: '2026-10' } });
    const first = buildInputHash({ metrics, misspellings: [{ target: 'because', input: 'becos', count: 1 }] });
    const second = buildInputHash({ metrics, misspellings: [{ target: 'because', input: 'becos', count: 1 }] });
    const changed = buildInputHash({ metrics, misspellings: [{ target: 'because', input: 'becase', count: 1 }] });
    assert.equal(first, second);
    assert.notEqual(first, changed);
});
