import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MAX_FAILED_ATTEMPTS,
    codeHint,
    generateCode,
    hashCode,
    isLocked,
    isWellFormedCode,
    lockStateAfterFailure,
    normalizeCode,
    verifyCode,
} from '../services/supportCodeService.js';

test('a generated code is six digits and never starts with zero', () => {
    for (const value of [100000, 100001, 999999]) {
        const code = generateCode(() => value);
        assert.equal(code, String(value));
        assert.match(code, /^\d{6}$/);
    }
});

test('codes are compared as digits, so spaces and dashes are harmless', () => {
    assert.equal(normalizeCode(' 12 34-56 '), '123456');
    assert.equal(isWellFormedCode('12345'), false);
    assert.equal(isWellFormedCode('12a456'), false);
    assert.equal(isWellFormedCode('123456'), true);
});

test('a code verifies only against its own hash', () => {
    const code = '314159';
    const hash = hashCode(code);
    assert.equal(verifyCode(code, hash), true);
    assert.equal(verifyCode('314158', hash), false);
    assert.equal(verifyCode(code, 'not-a-hash'), false);
});

test('the hint is the last two digits, never the whole code', () => {
    const hash = hashCode('271828');
    assert.equal(codeHint('271828'), '28');
    assert.equal(hash.includes('271828'), false);
});

test('repeated failures lock the code for a while and then reset the counter', () => {
    let state = { failedAttempts: 0, lockedUntil: null };
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt += 1) {
        state = lockStateAfterFailure(state.failedAttempts);
        assert.equal(state.lockedUntil, null);
    }
    state = lockStateAfterFailure(state.failedAttempts);
    assert.ok(state.lockedUntil instanceof Date);
    assert.equal(state.failedAttempts, 0);
    assert.equal(isLocked({ lockedUntil: state.lockedUntil }), true);
    assert.equal(isLocked({ lockedUntil: new Date(Date.now() - 1000) }), false);
});
