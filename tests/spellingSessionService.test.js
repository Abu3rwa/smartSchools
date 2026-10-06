import test from 'node:test';
import assert from 'node:assert/strict';
import {
    recordSpellingAttempt,
    startSpellingClassSession,
    startSpellingSession
} from '../services/spellingSessionService.js';
import { validateSpellingIntegrityEvent } from '../utils/spellingIntegrity.js';

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

test('startSpellingClassSession rejects invalid grade and mode before database access', async () => {
    await assert.rejects(
        () => startSpellingClassSession({
            schoolId: 'school-1',
            classId: 'class-1',
            studentIds: ['student-1'],
            userId: 'user-1',
            mode: 'unsupported',
            curriculumGrade: 'KG'
        }),
        (error) => error.statusCode === 400 && /Invalid spelling session mode/.test(error.message)
    );

    await assert.rejects(
        () => startSpellingClassSession({
            schoolId: 'school-1',
            classId: 'class-1',
            studentIds: ['student-1'],
            userId: 'user-1',
            mode: 'self-serve',
            curriculumGrade: 'G6'
        }),
        (error) => error.statusCode === 400 && /valid spelling grade/.test(error.message)
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
