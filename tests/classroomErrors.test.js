import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ClassroomSyncError,
    normalizeGoogleError,
    withRetry
} from '../services/classroomErrors.js';

const googleError = (status, extra = {}) => {
    const error = new Error(extra.message || `Google error ${status}`);
    error.response = { status, data: extra.data };
    return error;
};

test('normalizeGoogleError maps HTTP statuses to stable codes', () => {
    assert.equal(normalizeGoogleError(googleError(403)).code, 'PERMISSION_DENIED');
    assert.equal(normalizeGoogleError(googleError(404)).code, 'COURSE_NOT_FOUND');
    assert.equal(normalizeGoogleError(googleError(400)).code, 'INVALID_REQUEST');
    assert.equal(normalizeGoogleError(googleError(429)).code, 'RATE_LIMITED');
    assert.equal(normalizeGoogleError(googleError(503)).code, 'UNAVAILABLE');
    assert.equal(normalizeGoogleError(googleError(401)).code, 'AUTH_REVOKED');
    assert.equal(normalizeGoogleError(new Error('boom')).code, 'UNKNOWN');
});

test('normalizeGoogleError detects revoked grants, disabled API and quota', () => {
    assert.equal(
        normalizeGoogleError(googleError(400, { message: 'invalid_grant' })).code,
        'AUTH_REVOKED'
    );
    assert.equal(
        normalizeGoogleError(googleError(403, { message: 'Classroom API has not been used in project 1 before or it is disabled' })).code,
        'API_DISABLED'
    );
    const quota = normalizeGoogleError(googleError(403, { message: 'Quota exceeded' }));
    assert.equal(quota.code, 'RATE_LIMITED');
    assert.equal(quota.retryable, true);
});

test('normalizeGoogleError never leaks the raw Google message', () => {
    const error = normalizeGoogleError(googleError(403, {
        message: 'secret-token-abc student@example.com',
        data: { error: { message: 'secret-token-abc' } }
    }));
    assert.doesNotMatch(error.message, /secret-token-abc|student@example\.com/);
});

test('normalizeGoogleError passes ClassroomSyncError through unchanged', () => {
    const original = new ClassroomSyncError('MAPPING_NOT_FOUND', 'x');
    assert.equal(normalizeGoogleError(original), original);
});

test('withRetry retries rate limits with exponential backoff', async () => {
    const delays = [];
    let calls = 0;
    const result = await withRetry(
        async () => {
            calls += 1;
            if (calls < 3) throw googleError(429);
            return 'ok';
        },
        { baseDelayMs: 100, sleep: async (ms) => { delays.push(ms); } }
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
    assert.deepEqual(delays, [100, 200]);
});

test('withRetry gives up after the attempt limit', async () => {
    let calls = 0;
    await assert.rejects(
        withRetry(
            async () => { calls += 1; throw googleError(429); },
            { attempts: 3, sleep: async () => {} }
        ),
        (error) => error.code === 'RATE_LIMITED'
    );
    assert.equal(calls, 3);
});

test('withRetry does not retry server errors for non-idempotent calls', async () => {
    let calls = 0;
    await assert.rejects(
        withRetry(
            async () => { calls += 1; throw googleError(503); },
            { idempotent: false, sleep: async () => {} }
        ),
        (error) => error.code === 'UNAVAILABLE'
    );
    assert.equal(calls, 1);
});

test('withRetry retries server errors for idempotent calls', async () => {
    let calls = 0;
    const result = await withRetry(
        async () => {
            calls += 1;
            if (calls === 1) throw googleError(503);
            return 'ok';
        },
        { idempotent: true, sleep: async () => {} }
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
});

test('withRetry does not retry permission or validation failures', async () => {
    for (const status of [400, 403, 404]) {
        let calls = 0;
        await assert.rejects(
            withRetry(
                async () => { calls += 1; throw googleError(status); },
                { idempotent: true, sleep: async () => {} }
            )
        );
        assert.equal(calls, 1, `status ${status} must not be retried`);
    }
});
