import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CONNECTION_STATE,
    fromSchoolService,
    fromTokenStatus,
    summarizeSuite
} from './googleConnectionPresentation.js';

test('a live token status reads connected with its email', () => {
    assert.deepEqual(
        fromTokenStatus({ connected: true, email: 'a@amly.us' }),
        { state: CONNECTION_STATE.CONNECTED, email: 'a@amly.us' }
    );
});

test('a stored token Google no longer accepts reads as needing a reconnect, not as "not connected"', () => {
    assert.equal(fromTokenStatus({ connected: false, requiresReauth: true }).state, CONNECTION_STATE.EXPIRED);
    assert.equal(fromTokenStatus({ connected: false }).state, CONNECTION_STATE.NOT_CONNECTED);
});

test('a school service that is switched off for the school is unavailable, not disconnected', () => {
    assert.equal(
        fromSchoolService({ data: { enabled: false, connected: false } }).state,
        CONNECTION_STATE.UNAVAILABLE
    );
    assert.equal(
        fromSchoolService({ data: { enabled: true, connected: true, email: 't@amly.us' } }).state,
        CONNECTION_STATE.CONNECTED
    );
});

test('an unknown or failed status payload never claims a connection', () => {
    assert.equal(fromSchoolService(undefined).state, CONNECTION_STATE.NOT_CONNECTED);
    assert.equal(fromTokenStatus(undefined).state, CONNECTION_STATE.NOT_CONNECTED);
});

test('the suite summary is connected when any of the three services is', () => {
    const summary = summarizeSuite([
        { state: CONNECTION_STATE.UNAVAILABLE, email: '' },
        { state: CONNECTION_STATE.CONNECTED, email: 't@amly.us' },
        { state: CONNECTION_STATE.ERROR, email: '' }
    ]);
    assert.deepEqual(summary, { connected: true, email: 't@amly.us', unavailable: false });
});

test('the suite summary reports unavailable only when every service is switched off', () => {
    const allOff = summarizeSuite([
        { state: CONNECTION_STATE.UNAVAILABLE, email: '' },
        { state: CONNECTION_STATE.UNAVAILABLE, email: '' }
    ]);
    assert.deepEqual(allOff, { connected: false, email: '', unavailable: true });

    const mixed = summarizeSuite([{ state: CONNECTION_STATE.UNAVAILABLE, email: '' }]);
    assert.equal(mixed.unavailable, true);
    assert.equal(summarizeSuite([]).unavailable, false);
});
