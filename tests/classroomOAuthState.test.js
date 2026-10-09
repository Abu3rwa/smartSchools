import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import test from 'node:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-with-more-than-twenty-chars';

const { buildSignedState, parseSignedState } = await import('../utils/classroomOAuthState.js');

test('a freshly signed state round-trips the user id', () => {
    const state = buildSignedState('user-123');
    assert.equal(parseSignedState(state).userId, 'user-123');
});

test('a tampered payload or signature is rejected', () => {
    const state = buildSignedState('user-123');
    const [payload, signature] = state.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({
        userId: 'someone-else',
        purpose: 'google-classroom',
        exp: Date.now() + 60_000
    })).toString('base64url');

    assert.equal(parseSignedState(`${forgedPayload}.${signature}`), null);
    assert.equal(parseSignedState(`${payload}.${signature}x`), null);
    assert.equal(parseSignedState(`${payload}.${signature}.extra`), null);
});

test('an expired state is rejected', () => {
    const issuedAt = Date.now() - 11 * 60 * 1000;
    const state = buildSignedState('user-123', issuedAt);
    assert.equal(parseSignedState(state), null);
});

test('malformed or missing state is rejected', () => {
    assert.equal(parseSignedState(undefined), null);
    assert.equal(parseSignedState(''), null);
    assert.equal(parseSignedState('nodot'), null);
    assert.equal(parseSignedState(123), null);
});
