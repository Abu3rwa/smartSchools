import test from 'node:test';
import assert from 'node:assert/strict';
import {
    recordSpellingAttempt,
    startSpellingSession
} from '../services/spellingSessionService.js';

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
