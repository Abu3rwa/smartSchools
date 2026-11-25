import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Grade from '../models/Grade.js';
import GradebookConfig from '../models/GradebookConfig.js';
import Student from '../models/Student.js';
import SpellingRetestEvent from '../models/SpellingRetestEvent.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import { setSpellingAttemptOutcome } from '../services/spellingCorrectionService.js';
import {
    compareRetestStates,
    replayRetestGroup
} from '../services/spellingRetestReplay.js';
import {
    propagateRetestTypo,
    snapshotRetestState
} from '../services/spellingRetestStateService.js';

const retestState = (overrides = {}) => ({
    status: 'pending',
    correctRetestStreak: 0,
    incorrectRetestCount: 0,
    dueAt: null,
    lastRetestedAt: null,
    practiceMasteredAt: null,
    practiceMasteredBySession: null,
    resolvedAt: null,
    resolvedBySession: null,
    suppressedAt: null,
    wordSnapshot: null,
    wordRevision: null,
    ...overrides
});

const chain = (result) => {
    const api = {
        session() {
            return api;
        },
        select() {
            return api;
        },
        sort() {
            return api;
        },
        limit() {
            return api;
        },
        lean: async () => result,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    };
    return api;
};

const codeOf = (code) => (error) => {
    assert.equal(error.code, code, error.message);
    return true;
};

/**
 * In-memory stand-in for the retest collections. Only the queries the
 * correction service actually issues are modelled, so an unexpected read fails
 * loudly instead of silently returning nothing.
 */
const installFakeDb = (t, { session, rows = [], events = [] }) => {
    const nextSequence = (sourceWord) => events
        .filter((event) => String(event.sourceWord) === String(sourceWord))
        .reduce((max, event) => Math.max(max, event.sequence || 0), 0) + 1;

    t.mock.method(mongoose, 'startSession', async () => ({
        withTransaction: async (callback) => callback(),
        endSession: async () => {}
    }));
    t.mock.method(SpellingSession, 'findOne', (filter) => {
        if (filter?._id?.$ne) return chain(null);
        return chain(session);
    });
    t.mock.method(SpellingSession, 'find', () => chain([]));
    t.mock.method(SpellingRetestItem, 'find', (filter) => chain(rows.filter((row) => (
        (filter.sourceWord === undefined || String(row.sourceWord) === String(filter.sourceWord))
        && (filter.student === undefined || String(row.student) === String(filter.student))
    ))));
    t.mock.method(SpellingRetestItem, 'findOne', (filter) => {
        if (filter._id) {
            return chain(rows.find((row) => String(row._id) === String(filter._id)) || null);
        }
        return chain(rows.find((row) => (
            row.wordSnapshot === filter.wordSnapshot
            && row.status === filter.status
            && !row.suppressedAt
        )) || null);
    });
    t.mock.method(SpellingRetestItem, 'create', async ([doc]) => {
        const created = {
            ...doc,
            _id: new mongoose.Types.ObjectId(),
            revision: 1,
            save: async () => {}
        };
        rows.push(created);
        return [created];
    });
    t.mock.method(SpellingRetestEvent, 'find', (filter) => chain(events
        .filter((event) => filter.sourceWord === undefined
            || String(event.sourceWord) === String(filter.sourceWord))
        .sort((left, right) => left.sequence - right.sequence)));
    t.mock.method(SpellingRetestEvent, 'findOne', (filter) => chain(events
        .filter((event) => String(event.sourceWord) === String(filter.sourceWord))
        .sort((left, right) => right.sequence - left.sequence)[0] || null));
    t.mock.method(SpellingRetestEvent, 'create', async ([event]) => {
        const stored = { ...event, sequence: nextSequence(event.sourceWord) };
        events.push(stored);
        return [stored];
    });
    t.mock.method(Student, 'findOne', () => chain(null));
    t.mock.method(Student, 'updateOne', async () => ({ matchedCount: 1 }));
    t.mock.method(GradebookConfig, 'findOne', () => chain(null));
};

const buildRetestScenario = () => {
    const schoolId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const wordId = new mongoose.Types.ObjectId();
    const retestItemId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();
    const originalAttemptId = new mongoose.Types.ObjectId();
    const retestAttemptId = new mongoose.Types.ObjectId();
    const dueAt = new Date('2026-12-01T00:00:00.000Z');
    const firstAnswerAt = new Date('2026-11-20T10:00:00.000Z');

    const session = {
        _id: sessionId,
        school: schoolId,
        student: studentId,
        status: 'completed',
        assessmentType: 'spelling-assessment',
        mode: 'self-serve',
        curriculumGrade: 'G2',
        curriculumWeek: 1,
        correctCount: 1,
        mistakeCount: 1,
        revision: 1,
        attempts: [
            {
                _id: originalAttemptId,
                sequence: 1,
                wordId,
                isRetest: false,
                correct: true,
                skipped: false,
                studentInput: 'word',
                wordSnapshot: 'word',
                grade: 'G2',
                week: 1,
                category: 'Review',
                order: 1,
                revision: 1,
                correctionHistory: []
            },
            {
                _id: retestAttemptId,
                sequence: 2,
                wordId,
                retestItemId,
                isRetest: true,
                correct: false,
                skipped: false,
                studentInput: 'wrogn',
                wordSnapshot: 'word',
                grade: 'G2',
                week: 1,
                category: 'Review',
                revision: 1,
                correctionHistory: []
            }
        ],
        save: async () => {}
    };

    const row = {
        _id: retestItemId,
        school: schoolId,
        student: studentId,
        sourceWord: wordId,
        sourceAttempt: originalAttemptId,
        status: 'pending',
        correctRetestStreak: 0,
        incorrectRetestCount: 1,
        dueAt,
        lastRetestedAt: null,
        practiceMasteredAt: null,
        practiceMasteredBySession: null,
        resolvedAt: null,
        resolvedBySession: null,
        suppressedAt: null,
        wordSnapshot: 'word',
        wordRevision: 1,
        revision: 1,
        save: async () => {}
    };

    const events = [
        {
            kind: 'baseline',
            sourceWord: wordId,
            sequence: 1,
            outcome: { correct: false, skipped: false, formalTest: false },
            before: null,
            after: retestState({ dueAt, wordSnapshot: 'word', wordRevision: 1 }),
            retestItemIds: [retestItemId],
            sourceSession: sessionId,
            sourceAttempt: originalAttemptId,
            occurredAt: firstAnswerAt
        },
        {
            kind: 'answer',
            sourceWord: wordId,
            sequence: 2,
            outcome: { correct: false, skipped: false, formalTest: false },
            before: retestState({ dueAt, wordSnapshot: 'word', wordRevision: 1 }),
            after: retestState({ dueAt, wordSnapshot: 'word', wordRevision: 1, incorrectRetestCount: 1 }),
            retestItemIds: [retestItemId],
            sourceSession: sessionId,
            sourceAttempt: retestAttemptId,
            occurredAt: firstAnswerAt
        }
    ];

    return {
        schoolId,
        studentId,
        wordId,
        retestItemId,
        sessionId,
        originalAttemptId,
        retestAttemptId,
        session,
        row,
        events
    };
};

test('replay rebuilds the stored pending state from baseline and answers', () => {
    const scenario = buildRetestScenario();
    const replay = replayRetestGroup({ items: [scenario.row], events: scenario.events });
    assert.equal(replay.safe, true);
    assert.deepEqual(
        compareRetestStates(snapshotRetestState(scenario.row), replay.states.get(String(scenario.retestItemId))),
        []
    );
});

test('replay applies an override to only the corrected answer', () => {
    const scenario = buildRetestScenario();
    const overrides = new Map([[String(scenario.retestAttemptId), { correct: true, skipped: false }]]);
    const replay = replayRetestGroup({ items: [scenario.row], events: scenario.events, overrides });
    assert.equal(replay.safe, true);
    const state = replay.states.get(String(scenario.retestItemId));
    assert.equal(state.correctRetestStreak, 1);
    assert.equal(state.incorrectRetestCount, 0);
    assert.equal(state.status, 'pending');
});

test('replay refuses events whose answer provenance is missing', () => {
    const scenario = buildRetestScenario();
    const brokenEvents = scenario.events.map((event) => (
        event.kind === 'answer' ? { ...event, outcome: null } : event
    ));
    assert.deepEqual(
        replayRetestGroup({ items: [scenario.row], events: brokenEvents }),
        { safe: false, reason: 'missing-outcome' }
    );
    assert.deepEqual(
        replayRetestGroup({ items: [scenario.row], events: [] }),
        { safe: false, reason: 'missing-baseline' }
    );
});

test('replay reproduces schedule advances and typo renames exactly', () => {
    const scenario = buildRetestScenario();
    const advancedDueAt = new Date('2026-12-08T00:00:00.000Z');
    const scheduled = retestState({
        dueAt: advancedDueAt,
        lastRetestedAt: advancedDueAt,
        wordSnapshot: 'corrected',
        wordRevision: 2
    });
    const events = [
        ...scenario.events,
        {
            kind: 'schedule',
            sourceWord: scenario.wordId,
            sequence: 3,
            retestItemIds: [scenario.retestItemId],
            after: scheduled,
            occurredAt: advancedDueAt
        },
        {
            kind: 'typo',
            sourceWord: scenario.wordId,
            sequence: 4,
            retestItemIds: [scenario.retestItemId],
            after: scheduled,
            occurredAt: advancedDueAt
        }
    ];
    Object.assign(scenario.row, scheduled);
    const replay = replayRetestGroup({ items: [scenario.row], events });
    assert.equal(replay.safe, true);
    assert.deepEqual(
        compareRetestStates(snapshotRetestState(scenario.row), replay.states.get(String(scenario.retestItemId))),
        []
    );
});

test('setSpellingAttemptOutcome rejects malformed requests before touching the database', async () => {
    const base = {
        schoolId: new mongoose.Types.ObjectId(),
        sessionId: new mongoose.Types.ObjectId(),
        attemptId: new mongoose.Types.ObjectId(),
        actorId: new mongoose.Types.ObjectId(),
        action: 'correct',
        expectedRevision: 1,
        operationId: 'operation-123',
        reason: 'Teacher reviewed the answer.'
    };
    await assert.rejects(() => setSpellingAttemptOutcome({ ...base, action: 'delete' }), codeOf('INVALID_REQUEST'));
    await assert.rejects(() => setSpellingAttemptOutcome({ ...base, operationId: 'short' }), codeOf('INVALID_REQUEST'));
    await assert.rejects(() => setSpellingAttemptOutcome({ ...base, reason: 'no' }), codeOf('INVALID_REQUEST'));
    await assert.rejects(
        () => setSpellingAttemptOutcome({ ...base, expectedRevision: undefined }),
        codeOf('EXPECTATION_REQUIRED')
    );
    await assert.rejects(
        () => setSpellingAttemptOutcome({ ...base, action: 'undo', targetCorrectionRevision: null }),
        codeOf('EXPECTATION_REQUIRED')
    );
});

test('correct, retry, undo and rejections behave on a retest attempt', async (t) => {
    const scenario = buildRetestScenario();
    installFakeDb(t, { session: scenario.session, rows: [scenario.row], events: scenario.events });
    const actorId = new mongoose.Types.ObjectId();
    const base = {
        schoolId: scenario.schoolId,
        sessionId: scenario.sessionId,
        attemptId: scenario.retestAttemptId,
        actorId
    };

    const corrected = await setSpellingAttemptOutcome({
        ...base,
        action: 'correct',
        expectedRevision: 1,
        operationId: 'correction-op-1',
        reason: 'The student said the word correctly.'
    });
    assert.equal(corrected.idempotent, false);
    assert.equal(corrected.attempt.correct, true);
    assert.equal(corrected.attempt.revision, 2);
    assert.equal(corrected.session.correctCount, 2);
    assert.equal(corrected.session.mistakeCount, 0);
    assert.equal(scenario.row.correctRetestStreak, 1);
    assert.equal(scenario.row.incorrectRetestCount, 0);
    assert.equal(scenario.row.status, 'pending');
    const history = corrected.attempt.correctionHistory;
    assert.equal(history.length, 1);
    assert.equal(history[0].action, 'correct');
    assert.equal(history[0].previousCorrect, false);
    assert.equal(history[0].newCorrect, true);
    assert.deepEqual(history[0].retestItemIds.map(String), [String(scenario.retestItemId)]);
    assert.equal(scenario.events.filter((event) => event.kind === 'correction').length, 1);
    assert.equal(corrected.gradebookSynced, false);

    const retried = await setSpellingAttemptOutcome({
        ...base,
        action: 'correct',
        expectedRevision: 2,
        operationId: 'correction-op-1',
        reason: 'The student said the word correctly.'
    });
    assert.equal(retried.idempotent, true);
    assert.equal(retried.revision, 2);
    assert.equal(scenario.events.filter((event) => event.kind === 'correction').length, 1);

    await assert.rejects(
        () => setSpellingAttemptOutcome({
            ...base,
            action: 'correct',
            expectedRevision: 1,
            operationId: 'correction-op-2',
            reason: 'A second reviewer agrees.'
        }),
        codeOf('STALE_REVISION')
    );
    await assert.rejects(
        () => setSpellingAttemptOutcome({
            ...base,
            action: 'incorrect',
            expectedRevision: 2,
            operationId: 'correction-op-1',
            reason: 'Reusing the previous operation id.'
        }),
        codeOf('OPERATION_REUSED')
    );

    const undone = await setSpellingAttemptOutcome({
        ...base,
        action: 'undo',
        expectedRevision: 2,
        targetCorrectionRevision: 2,
        operationId: 'undo-op-1',
        reason: 'The first answer should stand.'
    });
    assert.equal(undone.attempt.correct, false);
    assert.equal(undone.attempt.revision, 3);
    assert.equal(scenario.row.correctRetestStreak, 0);
    assert.equal(scenario.row.incorrectRetestCount, 1);
    assert.equal(scenario.row.status, 'pending');
    assert.equal(undone.attempt.correctionHistory.at(-1).action, 'undo');

    await assert.rejects(
        () => setSpellingAttemptOutcome({
            ...base,
            action: 'undo',
            expectedRevision: 3,
            targetCorrectionRevision: 3,
            operationId: 'undo-op-2',
            reason: 'Nothing is left to undo.'
        }),
        codeOf('NOTHING_TO_UNDO')
    );
});

test('a correction is blocked while another active test pins the retest word', async (t) => {
    const scenario = buildRetestScenario();
    installFakeDb(t, { session: scenario.session, rows: [scenario.row], events: scenario.events });
    t.mock.method(SpellingSession, 'findOne', (filter) => (
        filter?._id?.$ne ? chain({ _id: new mongoose.Types.ObjectId() }) : chain(scenario.session)
    ));
    await assert.rejects(
        () => setSpellingAttemptOutcome({
            schoolId: scenario.schoolId,
            sessionId: scenario.sessionId,
            attemptId: scenario.retestAttemptId,
            actorId: new mongoose.Types.ObjectId(),
            action: 'correct',
            expectedRevision: 1,
            operationId: 'blocked-op-1',
            reason: 'Trying while another test is active.'
        }),
        codeOf('CORRECTION_BLOCKED')
    );
    assert.equal(scenario.session.attempts[1].revision, 1);
    assert.equal(scenario.row.correctRetestStreak, 0);
    assert.equal(scenario.events.filter((event) => event.kind === 'correction').length, 0);
});

test('skipped and abandoned attempts cannot be corrected', async (t) => {
    const scenario = buildRetestScenario();
    scenario.session.status = 'abandoned';
    scenario.session.attempts[1].skipped = true;
    installFakeDb(t, { session: scenario.session, rows: [scenario.row], events: scenario.events });
    const base = {
        schoolId: scenario.schoolId,
        sessionId: scenario.sessionId,
        attemptId: scenario.retestAttemptId,
        actorId: new mongoose.Types.ObjectId(),
        action: 'correct',
        expectedRevision: 1,
        reason: 'Attempting an invalid override.'
    };
    await assert.rejects(
        () => setSpellingAttemptOutcome({ ...base, operationId: 'skipped-op-1' }),
        codeOf('SESSION_ABANDONED')
    );
    scenario.session.status = 'completed';
    await assert.rejects(
        () => setSpellingAttemptOutcome({ ...base, operationId: 'skipped-op-2' }),
        codeOf('SKIPPED_ATTEMPT')
    );
    assert.equal(scenario.events.filter((event) => event.kind === 'correction').length, 0);
});

test('legacy answer events without an outcome block a retest correction atomically', async (t) => {
    const scenario = buildRetestScenario();
    scenario.events[1] = { ...scenario.events[1], outcome: null };
    installFakeDb(t, { session: scenario.session, rows: [scenario.row], events: scenario.events });
    await assert.rejects(
        () => setSpellingAttemptOutcome({
            schoolId: scenario.schoolId,
            sessionId: scenario.sessionId,
            attemptId: scenario.retestAttemptId,
            actorId: new mongoose.Types.ObjectId(),
            action: 'correct',
            expectedRevision: 1,
            operationId: 'legacy-op-1',
            reason: 'Trying to correct a legacy attempt.'
        }),
        codeOf('LEGACY_CORRECTION_UNSAFE')
    );
    assert.equal(scenario.session.attempts[1].revision, 1);
    assert.equal(scenario.row.incorrectRetestCount, 1);
    assert.equal(scenario.events.filter((event) => event.kind === 'correction').length, 0);
});

test('a typo rename updates outstanding retest text without touching streak, status or due date', async (t) => {
    const scenario = buildRetestScenario();
    installFakeDb(t, { session: scenario.session, rows: [scenario.row], events: scenario.events });
    const before = snapshotRetestState(scenario.row);

    const result = await propagateRetestTypo({
        schoolId: scenario.schoolId,
        wordId: scenario.wordId,
        newText: 'otterr',
        newRevision: 2,
        operationId: 'typo-op-1',
        at: new Date('2026-11-24T09:00:00.000Z')
    });

    assert.equal(result.updated, 1);
    assert.deepEqual(result.retestItemIds.map(String), [String(scenario.retestItemId)]);
    assert.equal(scenario.row.wordSnapshot, 'otterr');
    assert.equal(scenario.row.wordRevision, 2);
    assert.equal(scenario.row.correctRetestStreak, before.correctRetestStreak);
    assert.equal(scenario.row.incorrectRetestCount, before.incorrectRetestCount);
    assert.equal(scenario.row.status, before.status);
    assert.equal(scenario.row.dueAt.getTime(), before.dueAt.getTime());
    const typoEvent = scenario.events.find((event) => event.kind === 'typo');
    assert.ok(typoEvent);
    assert.equal(typoEvent.after.wordSnapshot, 'otterr');
    assert.equal(typoEvent.before.wordSnapshot, 'word');
});

test('a typo rename that would merge two pending retests is refused before any write', async (t) => {
    const scenario = buildRetestScenario();
    const otherStudentRow = {
        ...scenario.row,
        _id: new mongoose.Types.ObjectId(),
        student: new mongoose.Types.ObjectId(),
        sourceWord: new mongoose.Types.ObjectId(),
        wordSnapshot: 'otterr'
    };
    installFakeDb(t, { session: scenario.session, rows: [scenario.row], events: scenario.events });
    t.mock.method(SpellingRetestItem, 'findOne', () => chain(otherStudentRow));
    const originalText = scenario.row.wordSnapshot;

    await assert.rejects(
        () => propagateRetestTypo({
            schoolId: scenario.schoolId,
            wordId: scenario.wordId,
            newText: 'otterr',
            newRevision: 2,
            operationId: 'typo-op-2'
        }),
        codeOf('RETEST_TEXT_COLLISION')
    );
    assert.equal(scenario.row.wordSnapshot, originalText);
    assert.equal(scenario.events.filter((event) => event.kind === 'typo').length, 0);
});

const buildPracticeScenario = ({ formal = false } = {}) => {
    const scenario = buildRetestScenario();
    const attemptId = new mongoose.Types.ObjectId();
    const session = {
        ...scenario.session,
        _id: scenario.sessionId,
        status: 'completed',
        assessmentType: formal ? 'formal-spelling-test' : 'spelling-assessment',
        correctCount: 0,
        mistakeCount: 1,
        attempts: [
            {
                _id: attemptId,
                sequence: 1,
                wordId: scenario.wordId,
                isRetest: false,
                correct: false,
                skipped: false,
                studentInput: 'wrogn',
                wordSnapshot: 'word',
                grade: 'G2',
                week: 1,
                category: 'Review',
                order: 1,
                revision: 1,
                correctionHistory: []
            }
        ],
        save: async () => {}
    };
    if (formal) {
        session.gradebookSubject = new mongoose.Types.ObjectId();
        session.gradebookClass = new mongoose.Types.ObjectId();
        session.gradebookAcademicYear = '2026-2027';
        session.createdBy = new mongoose.Types.ObjectId();
    }
    const row = {
        ...scenario.row,
        sourceAttempt: attemptId
    };
    return { ...scenario, session, row, attemptId };
};

test('a practice-origin correction masters and un-masters only its own obligation', async (t) => {
    const scenario = buildPracticeScenario();
    installFakeDb(t, { session: scenario.session, rows: [scenario.row], events: scenario.events });
    t.mock.method(Grade, 'findOneAndUpdate', async () => {
        throw new Error('practice corrections must not write a Grade');
    });
    const base = {
        schoolId: scenario.schoolId,
        sessionId: scenario.sessionId,
        attemptId: scenario.attemptId,
        actorId: new mongoose.Types.ObjectId()
    };

    const corrected = await setSpellingAttemptOutcome({
        ...base,
        action: 'correct',
        expectedRevision: 1,
        operationId: 'practice-op-1',
        reason: 'The word was read aloud by mistake.'
    });
    assert.equal(corrected.attempt.correct, true);
    assert.equal(scenario.session.correctCount, 1);
    assert.equal(scenario.session.mistakeCount, 0);
    assert.equal(scenario.row.status, 'practice-mastered');
    assert.equal(String(scenario.row.practiceMasteredBySession), String(scenario.sessionId));
    assert.ok(scenario.row.suppressedAt == null);

    const undone = await setSpellingAttemptOutcome({
        ...base,
        action: 'undo',
        expectedRevision: 2,
        targetCorrectionRevision: 2,
        operationId: 'practice-undo-1',
        reason: 'Restore the original answer.'
    });
    assert.equal(undone.attempt.correct, false);
    assert.equal(scenario.row.status, 'pending');
    assert.equal(scenario.row.practiceMasteredBySession, null);
    assert.equal(scenario.session.correctCount, 0);
    assert.equal(scenario.session.mistakeCount, 1);
});

test('a corrected formal answer suppresses its obligation and re-syncs the same Grade row', async (t) => {
    const scenario = buildPracticeScenario({ formal: true });
    installFakeDb(t, { session: scenario.session, rows: [scenario.row], events: scenario.events });
    const gradeWrites = [];
    t.mock.method(Grade, 'findOneAndUpdate', async (filter, update) => {
        gradeWrites.push({ filter, update });
        return {};
    });
    const base = {
        schoolId: scenario.schoolId,
        sessionId: scenario.sessionId,
        attemptId: scenario.attemptId,
        actorId: new mongoose.Types.ObjectId()
    };

    const corrected = await setSpellingAttemptOutcome({
        ...base,
        action: 'correct',
        expectedRevision: 1,
        operationId: 'formal-op-1',
        reason: 'The student spelled the word correctly.'
    });
    assert.equal(corrected.gradebookSynced, true);
    assert.ok(scenario.row.suppressedAt instanceof Date);
    assert.equal(scenario.row.suppressedByCorrection, 'formal-op-1');
    assert.equal(gradeWrites.length, 1);
    assert.equal(String(gradeWrites[0].filter.spellingSession), String(scenario.sessionId));
    assert.equal(gradeWrites[0].update.$set.maxMarks, 1);
    assert.equal(gradeWrites[0].update.$set.marks, 1);

    const undone = await setSpellingAttemptOutcome({
        ...base,
        action: 'undo',
        expectedRevision: 2,
        targetCorrectionRevision: 2,
        operationId: 'formal-undo-1',
        reason: 'The original answer should stand.'
    });
    assert.equal(undone.gradebookSynced, true);
    assert.equal(scenario.row.suppressedAt, null);
    assert.equal(scenario.row.suppressedByCorrection, null);
    assert.equal(gradeWrites.length, 2);
    assert.equal(String(gradeWrites[1].filter.spellingSession), String(scenario.sessionId));
    assert.equal(gradeWrites[1].update.$set.maxMarks, 1);
    assert.equal(gradeWrites[1].update.$set.marks, 0);
});
