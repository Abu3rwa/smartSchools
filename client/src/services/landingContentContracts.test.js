import assert from 'node:assert/strict';
import test from 'node:test';
import {
    LANDING_ERROR_CODES,
    parseDemoRequestPayload,
    parseLandingPlansPayload,
    parseLandingSchoolsPayload,
    toLandingServiceError,
} from './landingContentContracts.js';

test('plans payload accepts a success envelope with an array', () => {
    const plans = [{ key: 'plan-a', name: 'Plan A' }];
    assert.deepEqual(parseLandingPlansPayload({ success: true, data: { plans } }), plans);
    assert.deepEqual(parseLandingPlansPayload({ success: true, data: { plans: [] } }), []);
});

test('plans payload rejects malformed envelopes instead of returning an empty array', () => {
    const cases = [
        null,
        undefined,
        {},
        { success: false, data: { plans: [] } },
        { success: true },
        { success: true, data: {} },
        { success: true, data: { plans: {} } },
        { success: true, data: { plans: null } },
    ];
    for (const payload of cases) {
        assert.throws(
            () => parseLandingPlansPayload(payload),
            (error) => error.code === LANDING_ERROR_CODES.invalidResponse,
        );
    }
});

test('school payload keeps only name and slug and reads hasMore', () => {
    const parsed = parseLandingSchoolsPayload({
        success: true,
        data: {
            schools: [{ name: 'Bright Future', slug: 'bright-future', _id: 'x', secret: 1 }],
            hasMore: true,
        },
    });
    assert.deepEqual(parsed, { schools: [{ name: 'Bright Future', slug: 'bright-future' }], hasMore: true });
});

test('school payload rejects a missing or non-boolean hasMore flag', () => {
    const cases = [
        { success: true, data: { schools: [] } },
        { success: true, data: { schools: [], hasMore: 'true' } },
        { success: true, data: { schools: [], hasMore: 1 } },
    ];
    for (const payload of cases) {
        assert.throws(
            () => parseLandingSchoolsPayload(payload),
            (error) => error.code === LANDING_ERROR_CODES.invalidResponse,
        );
    }
});

test('school payload rejects rows with a missing, blank or non-string name or slug', () => {
    const rows = [
        [{ name: 'A', slug: '' }],
        [{ name: '', slug: 'a' }],
        [{ name: '  ', slug: 'a' }],
        [{ name: 'A', slug: null }],
        [{ name: 12, slug: 'a' }],
        [{ name: 'A' }],
        [null],
        ['not-an-object'],
    ];
    for (const schools of rows) {
        assert.throws(
            () => parseLandingSchoolsPayload({ success: true, data: { schools } }),
            (error) => error.code === LANDING_ERROR_CODES.invalidResponse,
        );
    }
});

test('school payload rejects a missing school array', () => {
    assert.throws(
        () => parseLandingSchoolsPayload({ success: true, data: {} }),
        (error) => error.code === LANDING_ERROR_CODES.invalidResponse,
    );
});

test('demo request payload requires a confirmation id', () => {
    assert.deepEqual(parseDemoRequestPayload({ success: true, data: { id: 'abc123' } }), { id: 'abc123' });
    assert.throws(
        () => parseDemoRequestPayload({ success: true, data: {} }),
        (error) => error.code === LANDING_ERROR_CODES.invalidResponse,
    );
    assert.throws(
        () => parseDemoRequestPayload({ success: true, data: { id: '' } }),
        (error) => error.code === LANDING_ERROR_CODES.invalidResponse,
    );
    assert.throws(
        () => parseDemoRequestPayload({ success: true, data: { id: 42 } }),
        (error) => error.code === LANDING_ERROR_CODES.invalidResponse,
    );
    assert.throws(
        () => parseDemoRequestPayload({ success: false, data: { id: 'abc123' } }),
        (error) => error.code === LANDING_ERROR_CODES.invalidResponse,
    );
});

test('transport errors become unavailable and keep status, field errors and retry-after', () => {
    const error = toLandingServiceError({
        response: {
            status: 429,
            data: { errors: ['email'] },
            headers: { 'retry-after': '30' },
        },
    });
    assert.equal(error.code, LANDING_ERROR_CODES.unavailable);
    assert.equal(error.status, 429);
    assert.deepEqual(error.serverErrors, ['email']);
    assert.equal(error.retryAfter, 30);
});

test('cancellation stays distinguishable from failure', () => {
    const error = toLandingServiceError({ code: 'ERR_CANCELED', message: 'canceled' });
    assert.equal(error.code, LANDING_ERROR_CODES.cancelled);
});

test('an HTTP date retry-after is converted to seconds', () => {
    const future = new Date(Date.now() + 45000).toUTCString();
    const error = toLandingServiceError({ response: { status: 429, headers: { 'retry-after': future } } });
    assert.equal(error.code, LANDING_ERROR_CODES.unavailable);
    assert.ok(error.retryAfter >= 40 && error.retryAfter <= 45);
});

test('an existing landing error code is passed through unchanged', () => {
    const original = toLandingServiceError({ code: LANDING_ERROR_CODES.invalidResponse, message: 'bad' });
    assert.equal(toLandingServiceError(original), original);
});
