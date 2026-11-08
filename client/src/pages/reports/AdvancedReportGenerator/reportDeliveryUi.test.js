import test from 'node:test';
import assert from 'node:assert/strict';
import {
    RECIPIENT_ROLES,
    actionsFor,
    canUseSchoolScope,
    deliveryRowCopy,
    deliveryRows,
    hasFamilyRecipient,
    statusChip
} from './reportDeliveryUi.js';
import { DRAFT_STATUSES } from './constants.js';

test('every draft status has a chip, and unconfirmed delivery is not labelled sent or failed', () => {
    for (const status of Object.values(DRAFT_STATUSES)) {
        assert.ok(statusChip(status), `missing chip for ${status}`);
    }

    const unknown = statusChip(DRAFT_STATUSES.UNKNOWN).label.toLowerCase();
    assert.match(unknown, /unconfirmed/);
    assert.doesNotMatch(unknown, /\bsent\b(?!.*unconfirmed)/);
    assert.doesNotMatch(unknown, /failed/);

    const partial = statusChip(DRAFT_STATUSES.PARTIAL).label.toLowerCase();
    assert.match(partial, /partial/);
    assert.doesNotMatch(partial, /^sent$/);
});

test('an unknown delivery cannot be resent, so no family can get a duplicate by accident', () => {
    const actions = actionsFor(DRAFT_STATUSES.UNKNOWN);
    assert.equal(actions.canSend, false, 'unknown must never offer a plain resend');
    assert.equal(actions.canReopen, false, 'content must not change while the outcome is unverified');
    assert.equal(actions.canRetryFailed, false, 'retrying unknowns would resend to inboxes that already have it');
    assert.equal(actions.canCheckDelivery, true);
});

test('partial delivery offers a failed-only retry, not a full resend', () => {
    const actions = actionsFor(DRAFT_STATUSES.PARTIAL);
    assert.equal(actions.canRetryFailed, true);
    assert.equal(actions.canSend, false);
    assert.equal(actions.canCheckDelivery, true);
    assert.equal(actions.canReopen, true);
});

test('approved and failed drafts resend the same frozen email; draft edits, sent locks', () => {
    assert.deepEqual(actionsFor(DRAFT_STATUSES.DRAFT), {
        canApprove: true,
        canSend: false,
        canReopen: false,
        canRetryFailed: false,
        canCheckDelivery: false,
        isSent: false
    });

    for (const status of [DRAFT_STATUSES.APPROVED, DRAFT_STATUSES.FAILED]) {
        const actions = actionsFor(status);
        assert.equal(actions.canSend, true, `${status} must be sendable`);
        assert.equal(actions.canReopen, true, `${status} must stay fixable without spending AI credits`);
    }

    const sent = actionsFor(DRAFT_STATUSES.SENT);
    assert.equal(sent.isSent, true);
    assert.equal(sent.canSend, false);
    assert.equal(sent.canReopen, false);

    const sending = actionsFor(DRAFT_STATUSES.SENDING);
    assert.equal(sending.canSend, false, 'an in-flight send must not be claimed twice');
});

test('delivery rows read from both the send payload and the status payload', () => {
    const fromSend = { sent: 1, failed: 1, unknown: 0, results: [
        { email: 'mother@example.test', status: 'sent' },
        { email: 'father@example.test', status: 'failed', error: 'Mailbox unavailable' }
    ] };
    const fromStatus = { total: 1, sent: 0, failed: 0, pending: 0, unknown: 1, details: [
        { email: 'student@example.test', status: 'unknown' }
    ] };

    assert.equal(deliveryRows(fromSend).length, 2);
    assert.equal(deliveryRows(fromStatus)[0].status, 'unknown');
    assert.deepEqual(deliveryRows(null), []);
    assert.deepEqual(deliveryRows([{ email: 'a@example.test', status: 'sent' }]), [
        { email: 'a@example.test', status: 'sent' }
    ]);
});

test('per-address copy distinguishes delivered, not delivered and unconfirmed', () => {
    assert.equal(deliveryRowCopy({ status: 'sent' }), 'Delivered');
    assert.match(deliveryRowCopy({ status: 'failed', error: 'Rejected' }), /Not delivered — Rejected/);
    assert.match(deliveryRowCopy({ status: 'unknown' }), /Unconfirmed/);
    assert.doesNotMatch(deliveryRowCopy({ status: 'unknown' }), /Not delivered/,
        'an accepted-then-unrecorded send must not be reported as a failure');
    assert.equal(deliveryRowCopy({ status: 'pending' }), 'Pending');
});

test('only admins can build school-wide templates', () => {
    assert.equal(canUseSchoolScope({ role: 'teacher' }), false);
    assert.equal(canUseSchoolScope({ role: 'admin' }), true);
    assert.equal(canUseSchoolScope({ role: 'super_admin' }), true);
    assert.equal(canUseSchoolScope({ role: 'teacher', roles: ['teacher', 'admin'] }), true);
    assert.equal(canUseSchoolScope(undefined), false);
});

test('recipient roles match the server contact types, and a teacher-only send is refused', () => {
    assert.deepEqual(RECIPIENT_ROLES.map((r) => r.key), ['student', 'mother', 'father', 'guardian', 'teacher']);

    assert.equal(hasFamilyRecipient({ student: false, mother: false, father: false, guardian: false, teacher: true }), false);
    assert.equal(hasFamilyRecipient({ student: false, mother: true, father: false, guardian: false, teacher: false }), true);
    assert.equal(hasFamilyRecipient({ student: true, mother: false, father: false, guardian: false, teacher: false }), true);
});
