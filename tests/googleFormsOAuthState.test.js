import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';

process.env.GOOGLE_FORMS_OAUTH_STATE_SECRET = 'a-test-secret-for-google-forms-oauth-state';

const { buildGoogleFormsOAuthState, parseGoogleFormsOAuthState } =
    await import('../utils/googleFormsOAuthState.js');

test('round-trips a valid state and rejects modified signatures', () => {
    const state = buildGoogleFormsOAuthState('teacher-123');
    assert.equal(parseGoogleFormsOAuthState(state).userId, 'teacher-123');

    const [payload, signature] = state.split('.');
    assert.equal(parseGoogleFormsOAuthState(`${payload}.${signature}x`), null);
    assert.equal(parseGoogleFormsOAuthState(`${payload}.${signature}.extra`), null);
});

test('rejects expired, malformed, and wrong-purpose states', () => {
    const expired = buildGoogleFormsOAuthState('teacher-123', Date.now() - 11 * 60 * 1000);
    assert.equal(parseGoogleFormsOAuthState(expired), null);
    assert.equal(parseGoogleFormsOAuthState('invalid'), null);
    assert.equal(parseGoogleFormsOAuthState(undefined), null);
});
