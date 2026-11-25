import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SpellingLibraryState from '../models/SpellingLibraryState.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingWordProgress from '../models/SpellingWordProgress.js';
import {
    getCurrentSpellingItem,
    recordSpellingAttempt,
    startSpellingSession
} from '../services/spellingSessionService.js';
import { setSpellingAttemptOutcome } from '../services/spellingCorrectionService.js';
import { updateStudentSpellingPlacement } from '../controllers/spellingStudentController.js';

const chain = (value) => {
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
        setOptions() {
            return api;
        },
        lean: async () => value,
        then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
    };
    return api;
};

const mockTransaction = (t) => t.mock.method(mongoose, 'startSession', async () => ({
    withTransaction: async (callback) => callback(),
    endSession: async () => {}
}));

const callPlacement = async (request) => {
    let settle;
    const done = new Promise((resolve) => {
        settle = resolve;
    });
    const failures = [];
    let response;
    const res = {
        json(payload) {
            response = payload;
            settle();
            return payload;
        },
        status(code) {
            return {
                json(payload) {
                    response = { code, ...payload };
                    settle();
                    return payload;
                }
            };
        }
    };
    updateStudentSpellingPlacement(request, res, (error) => {
        failures.push(error);
        settle();
    });
    await done;
    return { response, failures };
};

const readyState = (overrides = {}) => ({
    grade: 'G1',
    version: 1,
    coordinationRevision: 0,
    progressSchemaVersion: 1,
    migrationStatus: 'ready',
    save: async () => {},
    ...overrides
});

const word = (id, week, order, extra = {}) => ({
    _id: id,
    school: 'school',
    grade: 'G1',
    week,
    order,
    word: `word-${id}`,
    normalizedWord: `word-${id}`,
    category: 'Curriculum',
    definition: '',
    revision: 1,
    deletedAt: null,
    ...extra
});

const buildStudent = (overrides = {}) => ({
    _id: 'student-1',
    school: 'school-1',
    currentClass: null,
    enrolledClasses: [],
    saveCalls: 0,
    async save() {
        this.saveCalls += 1;
    },
    spelling: {
        currentGrade: 'G1',
        currentWeek: 1,
        lastWordIndex: 0,
        traversalRevision: 0,
        progressByGrade: [
            { grade: 'G1', week: 1, lastWordIndex: 0, placementStartWeek: 1 }
        ]
    },
    ...overrides
});

const buildSession = (overrides = {}) => ({
    _id: 'session-1',
    school: 'school-1',
    student: 'student-1',
    status: 'in-progress',
    mode: 'self-serve',
    assessmentType: 'spelling-assessment',
    curriculumGrade: 'G1',
    curriculumWeek: 1,
    attempts: [],
    currentItem: {
        wordId: null,
        retestItemId: null,
        plannedWordIndex: null,
        sequence: null
    },
    nextSequence: 1,
    correctCount: 0,
    mistakeCount: 0,
    maxMistakesAllowed: 3,
    saveCalls: 0,
    async save() {
        this.saveCalls += 1;
    },
    ...overrides
});

const installCurriculum = (t, { words, consumed = [], session, student }) => {
    mockTransaction(t);
    t.mock.method(SpellingSession, 'findOne', () => chain(session));
    t.mock.method(SpellingRetestItem, 'findOne', () => chain(null));
    t.mock.method(SpellingWord, 'find', (filter = {}) => chain(
        words.filter((entry) => filter.grade === undefined || entry.grade === filter.grade)
    ));
    t.mock.method(SpellingWord, 'findOne', () => {
        throw new Error('Curriculum traversal must not query a single word by pointer');
    });
    t.mock.method(SpellingWordProgress, 'find', () => chain(
        consumed.map((wordId) => ({ wordId, student: 'student-1', grade: 'G1' }))
    ));
    t.mock.method(Student, 'findOne', () => chain(student));
    t.mock.method(SpellingLibraryState, 'findOneAndUpdate', async () => readyState());
};

test('an assessment resumes at the first unconsumed word even below the session week', async (t) => {
    const session = buildSession({ curriculumWeek: 2 });
    installCurriculum(t, {
        session,
        student: buildStudent(),
        words: [word('a', 1, 1), word('b', 1, 2), word('c', 2, 1)],
        consumed: ['a']
    });

    const { item } = await getCurrentSpellingItem({ schoolId: 'school-1', sessionId: 'session-1' });

    assert.equal(item.wordId, 'b');
    assert.equal(item.week, 1);
    assert.equal(item.order, 2);
    assert.equal(session.curriculumWeek, 1, 'the display week follows the ledger, not the old pointer');
    assert.equal(session.currentItem.wordId, 'b');
});

test('the current session cannot repeat a word it already asked', async (t) => {
    const session = buildSession({
        attempts: [{ sequence: 1, wordId: 'a', grade: 'G1', isRetest: false }]
    });
    installCurriculum(t, {
        session,
        student: buildStudent(),
        words: [word('a', 1, 1), word('b', 1, 2), word('c', 2, 1)],
        consumed: ['a']
    });

    const { item } = await getCurrentSpellingItem({ schoolId: 'school-1', sessionId: 'session-1' });

    assert.equal(item.wordId, 'b');
});

test('recording an answer consumes the word ID and derives the projection from the ledger', async (t) => {
    const session = buildSession({
        currentItem: { wordId: 'a', retestItemId: null, plannedWordIndex: null, sequence: 1 }
    });
    const student = buildStudent();
    const words = [word('a', 1, 1), word('b', 1, 2), word('c', 2, 1)];
    const progressUpserts = [];
    const studentUpdates = [];

    mockTransaction(t);
    t.mock.method(SpellingSession, 'findOne', () => chain(session));
    t.mock.method(SpellingWord, 'findOne', () => chain(words[0]));
    t.mock.method(SpellingWord, 'find', () => chain(words));
    t.mock.method(SpellingWordProgress, 'updateOne', async (filter, update) => {
        progressUpserts.push({ filter, update });
        return { upsertedCount: 1 };
    });
    t.mock.method(SpellingWordProgress, 'find', () => chain([{ wordId: 'a' }]));
    t.mock.method(Student, 'findOne', () => chain(student));
    t.mock.method(Student, 'updateOne', async (filter, update) => {
        studentUpdates.push({ filter, update });
        return { matchedCount: 1 };
    });
    t.mock.method(SpellingLibraryState, 'findOneAndUpdate', async () => readyState());

    const result = await recordSpellingAttempt({
        schoolId: 'school-1',
        sessionId: 'session-1',
        userId: 'teacher-1',
        sequence: 1,
        studentInput: 'word-a',
        correct: true,
        idempotencyKey: 'answer-a'
    });

    assert.equal(result.attempt.correct, true);
    assert.equal(session.mistakeCount, 0);

    assert.equal(progressUpserts.length, 1);
    assert.deepEqual(
        { student: progressUpserts[0].filter.student, wordId: progressUpserts[0].filter.wordId },
        { student: 'student-1', wordId: 'a' }
    );
    assert.equal(progressUpserts[0].update.$setOnInsert.source, 'attempt');
    assert.equal(progressUpserts[0].update.$setOnInsert.grade, 'G1');
    assert.equal(progressUpserts[0].update.$setOnInsert.sourceSession, 'session-1');

    const gradeUpdate = studentUpdates.find(
        (entry) => entry.update.$set && 'spelling.progressByGrade.$.week' in entry.update.$set
    );
    assert.ok(gradeUpdate, 'the derived projection is written');
    assert.equal(gradeUpdate.update.$set['spelling.progressByGrade.$.week'], 1);
    assert.equal(gradeUpdate.update.$set['spelling.progressByGrade.$.lastWordIndex'], 1);
});

test('a legacy pointer in an unmigrated grade blocks traversal instead of restarting the student', async (t) => {
    const session = buildSession();
    const student = buildStudent({
        spelling: {
            currentGrade: 'G1',
            currentWeek: 2,
            lastWordIndex: 2,
            traversalRevision: 0,
            progressByGrade: [{ grade: 'G1', week: 2, lastWordIndex: 2, placementStartWeek: 1 }]
        }
    });
    mockTransaction(t);
    t.mock.method(SpellingSession, 'findOne', () => chain(session));
    t.mock.method(SpellingRetestItem, 'findOne', () => chain(null));
    t.mock.method(Student, 'findOne', () => chain(student));
    t.mock.method(SpellingLibraryState, 'findOneAndUpdate', async () => readyState({ progressSchemaVersion: 0 }));
    t.mock.method(SpellingWordProgress, 'find', () => chain([]));

    await assert.rejects(
        () => getCurrentSpellingItem({ schoolId: 'school-1', sessionId: 'session-1' }),
        (error) => {
            assert.equal(error.code, 'MIGRATION_REQUIRED');
            assert.deepEqual(error.details, [{ grade: 'G1' }]);
            return true;
        }
    );
    assert.equal(session.saveCalls, 0);
});

test('a student already consuming word IDs is read from the ledger before the grade migration', async (t) => {
    const session = buildSession();
    const student = buildStudent({
        spelling: {
            currentGrade: 'G1',
            currentWeek: 1,
            lastWordIndex: 1,
            traversalRevision: 3,
            progressByGrade: [{ grade: 'G1', week: 1, lastWordIndex: 1, placementStartWeek: 1 }]
        }
    });
    installCurriculum(t, {
        session,
        student,
        words: [word('a', 1, 1), word('b', 1, 2)],
        consumed: ['a']
    });
    t.mock.method(SpellingLibraryState, 'findOneAndUpdate', async () => readyState({ progressSchemaVersion: 0 }));

    const { item } = await getCurrentSpellingItem({ schoolId: 'school-1', sessionId: 'session-1' });

    assert.equal(item.wordId, 'b');
});

test('correcting an original answer never rewrites curriculum consumption', async (t) => {
    const attempt = {
        _id: 'attempt-1',
        sequence: 1,
        wordId: 'a',
        isRetest: false,
        correct: false,
        skipped: false,
        studentInput: 'wrong',
        wordSnapshot: 'word-a',
        grade: 'G1',
        week: 1,
        category: 'Curriculum',
        order: 1,
        revision: 1,
        correctionHistory: []
    };
    const session = buildSession({
        status: 'completed',
        attempts: [attempt],
        correctCount: 0,
        mistakeCount: 1
    });
    const studentUpdates = [];

    mockTransaction(t);
    t.mock.method(SpellingSession, 'findOne', () => chain(session));
    t.mock.method(SpellingSession, 'find', () => chain([]));
    t.mock.method(SpellingRetestItem, 'find', () => chain([]));
    t.mock.method(Student, 'updateOne', async (filter, update) => {
        studentUpdates.push({ filter, update });
        return { matchedCount: 1 };
    });
    t.mock.method(SpellingWordProgress, 'updateOne', async () => {
        throw new Error('A correction must not consume or release a curriculum word');
    });

    const result = await setSpellingAttemptOutcome({
        schoolId: 'school-1',
        sessionId: 'session-1',
        attemptId: 'attempt-1',
        actorId: 'teacher-1',
        action: 'correct',
        expectedRevision: 1,
        operationId: 'correction-ledger-1',
        reason: 'Teacher accepted the spoken answer.'
    });

    assert.equal(result.attempt.correct, true);
    assert.equal(result.session.correctCount, 1);
    assert.equal(result.session.mistakeCount, 0);
    assert.deepEqual(studentUpdates, []);
});

test('a completed grade promotes to the next grade using the consumed set', async (t) => {
    const student = buildStudent({
        spelling: {
            currentGrade: 'G1',
            currentWeek: 1,
            lastWordIndex: 2,
            traversalRevision: 4,
            progressByGrade: [{ grade: 'G1', week: 1, lastWordIndex: 2, placementStartWeek: 1 }]
        }
    });
    const promoted = buildStudent({
        spelling: {
            currentGrade: 'G2',
            currentWeek: 1,
            lastWordIndex: 0,
            traversalRevision: 5,
            progressByGrade: [
                { grade: 'G1', week: 1, lastWordIndex: 2, placementStartWeek: 1 },
                { grade: 'G2', week: 1, lastWordIndex: 0, placementStartWeek: 1 }
            ]
        }
    });
    const words = [
        word('a', 1, 1),
        word('b', 1, 2),
        word('g2a', 1, 1, { grade: 'G2' })
    ];
    const created = buildSession({
        _id: 'session-2',
        curriculumGrade: 'G2',
        curriculumWeek: 1
    });
    let currentStudent = student;
    let sessionCreated = false;
    const stateSaves = [];

    mockTransaction(t);
    t.mock.method(SpellingSession, 'findOne', () => chain(
        sessionCreated ? created : null
    ));
    t.mock.method(SpellingSession, 'create', async ([doc]) => {
        Object.assign(created, doc);
        sessionCreated = true;
        return [created];
    });
    t.mock.method(SpellingRetestItem, 'findOne', () => chain(null));
    t.mock.method(SpellingWord, 'find', (filter = {}) => chain(
        words.filter((entry) => filter.grade === undefined || entry.grade === filter.grade)
    ));
    t.mock.method(SpellingWord, 'countDocuments', async () => 1);
    t.mock.method(SpellingWordProgress, 'find', (filter = {}) => chain(
        filter.grade === 'G1' ? [{ wordId: 'a' }, { wordId: 'b' }] : []
    ));
    t.mock.method(Student, 'findOne', () => chain(currentStudent));
    t.mock.method(Student, 'findOneAndUpdate', () => {
        currentStudent = promoted;
        return chain(promoted);
    });
    t.mock.method(Student, 'updateOne', async () => ({ matchedCount: 1 }));
    t.mock.method(SpellingLibraryState, 'findOneAndUpdate', async (filter) => {
        const state = readyState({ grade: filter.grade });
        state.save = async () => {
            stateSaves.push(filter.grade);
        };
        return state;
    });

    const session = await startSpellingSession({
        schoolId: 'school-1',
        studentId: 'student-1',
        userId: 'teacher-1',
        mode: 'self-serve',
        maxMistakesAllowed: 3,
        curriculumGrade: 'G1'
    });

    assert.equal(session.curriculumGrade, 'G2');
    assert.equal(session.curriculumWeek, 1);
});

test('G5 still rejects a start after every eligible word is consumed', async (t) => {
    const student = buildStudent({
        spelling: {
            currentGrade: 'G5',
            currentWeek: 1,
            lastWordIndex: 1,
            traversalRevision: 2,
            progressByGrade: [{ grade: 'G5', week: 1, lastWordIndex: 1, placementStartWeek: 1 }]
        }
    });
    mockTransaction(t);
    t.mock.method(SpellingSession, 'findOne', () => chain(null));
    t.mock.method(SpellingWord, 'find', () => chain([word('g5', 1, 1, { grade: 'G5' })]));
    t.mock.method(SpellingWordProgress, 'find', () => chain([{ wordId: 'g5' }]));
    t.mock.method(Student, 'findOne', () => chain(student));
    t.mock.method(SpellingLibraryState, 'findOneAndUpdate', async () => readyState());

    await assert.rejects(
        () => startSpellingSession({
            schoolId: 'school-1',
            studentId: 'student-1',
            userId: 'teacher-1',
            mode: 'self-serve',
            maxMistakesAllowed: 3,
            curriculumGrade: 'G5'
        }),
        /completed all available spelling grades \(G5\)/
    );
});

test('first placement into a grade records a week-one floor and derives the projection', async (t) => {
    const student = buildStudent({
        spelling: {
            currentGrade: null,
            currentWeek: null,
            lastWordIndex: 0,
            traversalRevision: 0,
            progressByGrade: []
        }
    });
    const studentUpdates = [];
    const req = {
        body: { grade: 'G1' },
        params: { studentId: 'student-1' },
        schoolId: 'school-1',
        user: { role: 'admin', _id: 'admin-1' }
    };
    t.mock.method(Student, 'findOne', () => chain(student));
    t.mock.method(Student, 'updateOne', async (filter, update) => {
        studentUpdates.push({ filter, update });
        return { matchedCount: 1 };
    });
    t.mock.method(SpellingWord, 'find', () => chain([word('a', 1, 1)]));
    t.mock.method(SpellingWordProgress, 'find', () => chain([]));

    const { response, failures } = await callPlacement(req);

    assert.deepEqual(failures, []);
    assert.equal(response.success, true);
    const entry = student.spelling.progressByGrade.find((item) => item.grade === 'G1');
    assert.equal(entry.placementStartWeek, 1);
    assert.equal(student.spelling.currentGrade, 'G1');
    const projection = studentUpdates.find(
        (update) => update.update.$set && 'spelling.progressByGrade.$.week' in update.update.$set
    );
    assert.ok(projection, 'the projection is recalculated after placement');
    assert.equal(projection.update.$set['spelling.progressByGrade.$.lastWordIndex'], 0);
});

test('placement into an unmigrated grade keeps the saved projection instead of resetting it', async (t) => {
    const student = buildStudent({
        spelling: {
            currentGrade: null,
            currentWeek: null,
            lastWordIndex: 0,
            traversalRevision: 0,
            progressByGrade: [{ grade: 'G1', week: 8, lastWordIndex: 12 }]
        }
    });
    const studentUpdates = [];
    const req = {
        body: { grade: 'G1' },
        params: { studentId: 'student-1' },
        schoolId: 'school-1',
        user: { role: 'admin', _id: 'admin-1' }
    };
    t.mock.method(Student, 'findOne', () => chain(student));
    t.mock.method(Student, 'updateOne', async (filter, update) => {
        studentUpdates.push({ filter, update });
        return { matchedCount: 1 };
    });
    t.mock.method(SpellingLibraryState, 'findOneAndUpdate', async () => readyState({ progressSchemaVersion: 0 }));
    t.mock.method(SpellingWordProgress, 'find', () => chain([]));

    const { response, failures } = await callPlacement(req);

    assert.deepEqual(failures, []);
    assert.equal(response.success, true);
    assert.equal(student.spelling.currentGrade, 'G1');
    assert.equal(student.spelling.progressByGrade[0].week, 8);
    assert.deepEqual(studentUpdates, []);
});
