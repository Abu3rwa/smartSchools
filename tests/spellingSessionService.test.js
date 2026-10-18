import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SpellingEmailDelivery from '../models/SpellingEmailDelivery.js';
import SpellingPassage from '../models/SpellingPassage.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingWord from '../models/SpellingWord.js';
import {
    getCurrentSpellingItem,
    cancelScheduledSpellingSession,
    recordSpellingAttempt,
    startSpellingSession
} from '../services/spellingSessionService.js';
import { listSpellingSessions } from '../services/spellingReadService.js';
import { validateSpellingIntegrityEvent } from '../utils/spellingIntegrity.js';

test('active roster prioritizes a practice session over a future scheduled test', async (t) => {
    const scheduledSession = {
        _id: 'scheduled-session',
        status: 'scheduled',
        startedAt: new Date(Date.now() + 60 * 60 * 1000)
    };
    const practiceSession = {
        _id: 'practice-session',
        status: 'in-progress',
        startedAt: new Date()
    };
    const query = (result) => ({
        sort() { return this; },
        limit() { return this; },
        select() { return this; },
        lean: async () => result
    });

    t.mock.method(SpellingSession, 'find', () => query([scheduledSession, practiceSession]));
    t.mock.method(SpellingPassage, 'find', () => query([]));

    const sessions = await listSpellingSessions({
        schoolId: new mongoose.Types.ObjectId(),
        studentId: new mongoose.Types.ObjectId(),
        viewerRole: 'student',
        activeOnly: true
    });

    assert.deepEqual(sessions.map((session) => session._id), ['practice-session', 'scheduled-session']);
});

test('cancelling a scheduled spelling session also cancels its pending preparation email', async (t) => {
    const schoolId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();
    const cancelledSession = { _id: sessionId, school: schoolId, status: 'abandoned' };
    let emailCancellationFilter;

    t.mock.method(mongoose, 'startSession', async () => ({
        withTransaction: async (callback) => callback(),
        endSession: async () => {}
    }));
    t.mock.method(SpellingSession, 'findOneAndUpdate', async (filter, update) => {
        assert.equal(filter.status, 'scheduled');
        assert.equal(update.$set.status, 'abandoned');
        return cancelledSession;
    });
    t.mock.method(SpellingEmailDelivery, 'updateMany', async (filter, update) => {
        emailCancellationFilter = filter;
        assert.equal(update.$set.status, 'cancelled');
    });

    const result = await cancelScheduledSpellingSession({ schoolId, sessionId });

    assert.equal(result, cancelledSession);
    assert.equal(emailCancellationFilter.session, sessionId);
    assert.equal(emailCancellationFilter.kind, 'formal-test-prep');
    assert.deepEqual(emailCancellationFilter.status.$in, ['staging', 'pending']);
});

test('regular and formal sessions select pending missed words before curriculum words', async (t) => {
    let activeSession;
    let retestQuery;
    let retestSort;
    const schoolId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();
    const retestId = new mongoose.Types.ObjectId();
    const sourceWordId = new mongoose.Types.ObjectId();
    const pendingRetest = {
        _id: retestId,
        sourceWord: sourceWordId,
        wordSnapshot: 'missed-word',
        grade: 'G2',
        week: 1,
        category: 'Earlier words'
    };

    const query = (result) => ({
        session() { return this; },
        sort(value) {
            retestSort = value;
            return this;
        },
        lean: async () => result,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    });

    t.mock.method(mongoose, 'startSession', async () => ({
        withTransaction: async (callback) => callback(),
        endSession: async () => {}
    }));
    t.mock.method(SpellingSession, 'findOne', () => query(activeSession));
    t.mock.method(Student, 'findOne', () => query({ _id: studentId }));
    t.mock.method(SpellingRetestItem, 'findOne', (filter) => {
        retestQuery = filter;
        return query(pendingRetest);
    });
    t.mock.method(SpellingWord, 'findOne', () => query({ definition: 'A missed word' }));

    for (const assessmentType of ['spelling-assessment', 'formal-spelling-test']) {
        activeSession = {
            _id: sessionId,
            school: schoolId,
            student: studentId,
            status: 'in-progress',
            assessmentType,
            attempts: [],
            currentItem: { wordId: null, retestItemId: null, sequence: null },
            nextSequence: 1,
            save: async () => {}
        };
        retestQuery = null;
        retestSort = null;

        const current = await getCurrentSpellingItem({ schoolId, sessionId });

        assert.equal(current.item.word, 'missed-word');
        assert.equal(current.item.isRetest, true);
        assert.equal(current.item.retestItemId, retestId);
        assert.equal(retestQuery.status, 'pending');
        assert.equal(retestQuery.sourceSession.$ne, sessionId);
        assert.deepEqual(retestQuery._id.$nin, []);
        assert.deepEqual(retestSort, { flaggedAt: 1, _id: 1 });
    }
});

test('validateSpellingIntegrityEvent accepts a page-hidden event and normalizes optional fields', () => {
    const event = validateSpellingIntegrityEvent({
        eventId: '6ab939b2-b1cd-4ea1-8031-bd40aa111111',
        eventType: 'page_hidden',
        occurredAt: '2026-09-27T12:00:00.000Z'
    });

    assert.equal(event.sequence, null);
    assert.equal(event.occurredAt.toISOString(), '2026-09-27T12:00:00.000Z');
});

test('validateSpellingIntegrityEvent rejects malformed payloads', () => {
    const eventId = '6ab939b2-b1cd-4ea1-8031-bd40aa111111';
    assert.throws(() => validateSpellingIntegrityEvent({ eventId: 'invalid', eventType: 'page_hidden' }), /valid eventId/);
    assert.throws(() => validateSpellingIntegrityEvent({ eventId, eventType: 'window_blur' }), /Invalid spelling integrity event type/);
    assert.throws(() => validateSpellingIntegrityEvent({ eventId, eventType: 'page_hidden', sequence: 0 }), /positive integer/);
    assert.throws(() => validateSpellingIntegrityEvent({ eventId, eventType: 'page_hidden', occurredAt: 'invalid-date' }), /valid date/);
});

test('teacher-led spelling sessions are rejected before database access', async () => {
    await assert.rejects(
        () => startSpellingSession({
            schoolId: 'school-1',
            studentId: 'student-1',
            userId: 'user-1',
            mode: 'teacher-led',
            maxMistakesAllowed: 3
        }),
        (error) => error.statusCode === 400 && /Teacher-led spelling sessions are no longer available/.test(error.message)
    );
});

test('startSpellingSession rejects invalid modes before database access', async () => {
    await assert.rejects(
        () => startSpellingSession({
            schoolId: 'school-1',
            studentId: 'student-1',
            userId: 'user-1',
            mode: 'unsupported',
            maxMistakesAllowed: 3
        }),
        (error) => error.statusCode === 400 && /Invalid spelling session mode/.test(error.message)
    );
});

test('formal spelling assessments must be self-serve before database access', async () => {
    await assert.rejects(
        () => startSpellingSession({
            schoolId: 'school-1',
            studentId: 'student-1',
            userId: 'user-1',
            mode: 'teacher-led',
            formalAssessment: true
        }),
        (error) => error.statusCode === 400 && /Formal spelling assessments must be self-serve/.test(error.message)
    );
});

test('startSpellingSession rejects invalid mistake limits before database access', async () => {
    await assert.rejects(
        () => startSpellingSession({
            schoolId: 'school-1',
            studentId: 'student-1',
            userId: 'user-1',
            mode: 'self-serve',
            maxMistakesAllowed: 0
        }),
        (error) => error.statusCode === 400 && /positive integer/.test(error.message)
    );
});

test('startSpellingSession rejects invalid email audiences before database access', async () => {
    await assert.rejects(
        () => startSpellingSession({
            schoolId: 'school-1',
            studentId: 'student-1',
            userId: 'user-1',
            mode: 'self-serve',
            maxMistakesAllowed: 3,
            emailNotification: 'teachers-only'
        }),
        (error) => error.statusCode === 400 && /Invalid spelling email audience/.test(error.message)
    );
});

test('startSpellingSession rejects invalid or past deadlines before database access', async () => {
    await assert.rejects(
        () => startSpellingSession({
            schoolId: 'school-1',
            studentId: 'student-1',
            userId: 'user-1',
            mode: 'self-serve',
            maxMistakesAllowed: 3,
            retestDeadline: 'not-a-date'
        }),
        (error) => error.statusCode === 400 && /valid future date/.test(error.message)
    );

    await assert.rejects(
        () => startSpellingSession({
            schoolId: 'school-1',
            studentId: 'student-1',
            userId: 'user-1',
            mode: 'self-serve',
            maxMistakesAllowed: 3,
            retestDeadline: new Date(Date.now() - 1000)
        }),
        (error) => error.statusCode === 400 && /valid future date/.test(error.message)
    );
});

test('startSpellingSession rejects invalid or non-future scheduled dates before database access', async () => {
    await assert.rejects(
        () => startSpellingSession({
            schoolId: 'school-1',
            studentId: 'student-1',
            userId: 'user-1',
            mode: 'self-serve',
            maxMistakesAllowed: 3,
            scheduledAt: 'not-a-date'
        }),
        (error) => error.statusCode === 400 && /scheduledAt must be a valid future date/.test(error.message)
    );

    await assert.rejects(
        () => startSpellingSession({
            schoolId: 'school-1',
            studentId: 'student-1',
            userId: 'user-1',
            mode: 'self-serve',
            maxMistakesAllowed: 3,
            scheduledAt: new Date(Date.now() - 1000)
        }),
        (error) => error.statusCode === 400 && /scheduledAt must be a valid future date/.test(error.message)
    );
});

test('recordSpellingAttempt rejects malformed sequence and idempotency input', async () => {
    await assert.rejects(
        () => recordSpellingAttempt({
            schoolId: 'school-1',
            sessionId: 'session-1',
            userId: 'user-1',
            sequence: 0,
            idempotencyKey: 'attempt-1'
        }),
        (error) => error.statusCode === 400 && /sequence must be a positive integer/.test(error.message)
    );

    await assert.rejects(
        () => recordSpellingAttempt({
            schoolId: 'school-1',
            sessionId: 'session-1',
            userId: 'user-1',
            sequence: 1
        }),
        (error) => error.statusCode === 400 && /idempotencyKey is required/.test(error.message)
    );
});
