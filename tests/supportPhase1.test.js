import assert from 'node:assert/strict';
import test from 'node:test';

// The shared eslint config has no node globals for tests/, so reach process
// through globalThis to keep `eslint .` clean on this file.
globalThis.process.env.JWT_SECRET = globalThis.process.env.JWT_SECRET || 'test-support-phase1-secret';

import {
    caseAccessContext,
} from '../services/supportCaseService.js';
import {
    matchParentRespondent,
} from '../services/supportParentService.js';
import {
    sessionStillValid,
    signAccessToken,
    verifyAccessToken,
} from '../services/supportAccessService.js';
import {
    ensureSupportActive,
} from '../services/supportSettingsService.js';
import { clientKey } from '../middleware/rateLimiters.js';

/* ------------------------------ staff access ------------------------------ */

const userDoc = (id, roles = ['teacher']) => ({ _id: id, role: roles[0], roles });

test('case access compares populated documents by their _id', () => {
    const ownerId = '64b0000000000000000000a1';
    const caseDoc = {
        owner: { _id: ownerId, firstName: 'Owner' },
        homeroomTeacher: { _id: '64b0000000000000000000b2' },
        counselor: null,
        participants: [{ user: { _id: ownerId, firstName: 'Owner' }, role: 'teacher', active: true }],
    };
    const context = caseAccessContext({ caseDoc, user: userDoc(ownerId) });
    assert.equal(context.canView, true);
    assert.equal(context.canManage, true);
    assert.equal(context.isOwner, true);
    assert.equal(context.isParticipant, true);
});

test('a participant whose user row is populated can still open the case', () => {
    const participantId = '64b0000000000000000000c3';
    const caseDoc = {
        owner: '64b0000000000000000000d4',
        homeroomTeacher: '64b0000000000000000000d4',
        counselor: null,
        participants: [{ user: { _id: participantId }, role: 'teacher', active: true }],
    };
    const context = caseAccessContext({ caseDoc, user: userDoc(participantId) });
    assert.equal(context.canView, true);
    assert.equal(context.canManage, false);
});

test('unrelated staff can neither view nor manage the case', () => {
    const caseDoc = {
        owner: '64b0000000000000000000d4',
        homeroomTeacher: '64b0000000000000000000d4',
        counselor: null,
        participants: [],
    };
    const context = caseAccessContext({ caseDoc, user: userDoc('64b0000000000000000000e5') });
    assert.equal(context.canView, false);
    assert.equal(context.canManage, false);
    assert.equal(context.canSeeStudentRaw, false);
});

/* ----------------------------- parent binding ----------------------------- */

test('a portal parent matches their own respondent, not the first household row', () => {
    const parentId = '64b0000000000000000000f6';
    const parentUser = { _id: parentId, email: 'father@example.com' };
    const respondents = [
        { _id: '64b000000000000000000001', email: 'mother@example.com', parentSlot: 'mother' },
        { _id: '64b000000000000000000002', email: 'father@example.com', parentSlot: 'father' },
    ];
    const matched = matchParentRespondent(respondents, parentUser);
    assert.equal(String(matched._id), '64b000000000000000000002');
});

test('a parent with no matching respondent resolves to none', () => {
    const respondents = [{ _id: '64b000000000000000000001', email: 'mother@example.com' }];
    assert.equal(matchParentRespondent(respondents, { _id: '64b0000000000000000000f7', email: 'aunt@example.com' }), null);
    assert.equal(matchParentRespondent(respondents, { _id: '64b0000000000000000000f7', email: '' }), null);
});

test('a respondent explicitly linked to the parent user wins over email order', () => {
    const parentId = '64b0000000000000000000f8';
    const parentUser = { _id: parentId, email: 'shared@example.com' };
    const respondents = [
        { _id: '64b000000000000000000001', email: 'other@example.com' },
        { _id: '64b000000000000000000002', email: 'unused@example.com', parentUser: parentId },
    ];
    assert.equal(String(matchParentRespondent(respondents, parentUser)._id), '64b000000000000000000002');
});

/* -------------------------- sessions and revocation -------------------------- */

const respondent = (overrides = {}) => ({
    _id: '64b0000000000000000000aa',
    school: '64b0000000000000000000bb',
    kind: 'parent',
    tokenVersion: 2,
    ...overrides,
});

test('an access token carries the respondent version and a short expiry', () => {
    const token = signAccessToken(respondent());
    const decoded = verifyAccessToken(token);
    assert.equal(decoded.supportRespondent, '64b0000000000000000000aa');
    assert.equal(decoded.tokenVersion, 2);
    assert.ok(decoded.exp - decoded.iat <= 60 * 30 + 5, 'token must live at most ~30 minutes');
});

test('issuing a new code version invalidates sessions from the old code', () => {
    const decoded = verifyAccessToken(signAccessToken(respondent()));
    assert.equal(sessionStillValid(decoded, respondent()), true);
    assert.equal(sessionStillValid(decoded, respondent({ tokenVersion: 3 })), false);
    assert.equal(sessionStillValid(decoded, respondent({ tokenVersion: 0 })), false);
});

test('a tampered or missing token version is rejected', () => {
    const decoded = verifyAccessToken(signAccessToken(respondent()));
    assert.equal(sessionStillValid({ ...decoded, tokenVersion: undefined }, respondent()), false);
});

/* --------------------------------- pause --------------------------------- */

test('a paused school blocks support writes with the pause error', () => {
    assert.throws(
        () => ensureSupportActive({ enabled: false }),
        (error) => error.code === 'SUPPORT_PAUSED' && error.status === 403,
    );
    const active = ensureSupportActive({ enabled: true });
    assert.equal(active.enabled, true);
});

/* ------------------------------ rate limiter ------------------------------ */

test('limiter keys are stable per IP and distinct across IPs', () => {
    const reqA1 = { ip: '203.0.113.10' };
    const reqA2 = { ip: '203.0.113.10' };
    const reqB = { ip: '203.0.113.11' };
    assert.equal(clientKey(reqA1), clientKey(reqA2));
    assert.notEqual(clientKey(reqA1), clientKey(reqB));
});
