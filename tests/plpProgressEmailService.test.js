import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildPlpEmailRecipientCandidates,
    buildPlpProgressEmail,
    getPlpEmailDeliveryAttempt,
} from '../services/plpProgressEmailService.js';

test('email candidates use student-record contacts without opt-in and deduplicate shared addresses', () => {
    const student = {
        firstName: 'Ava',
        lastName: 'Lee',
        studentEmail: 'STUDENT@example.test',
        parentInfo: {
            fatherName: 'Alex Lee',
            fatherEmail: 'family@example.test',
            motherName: 'Morgan Lee',
            motherEmail: 'family@example.test',
            guardianEmail: 'guardian@example.test',
        },
    };
    const recipients = buildPlpEmailRecipientCandidates(student, [
        { recipientEmail: 'family@example.test', recipientType: 'mother', optedIn: true },
        { recipientEmail: 'guardian@example.test', recipientType: 'guardian', optedIn: false, revokedAt: new Date() },
    ]);
    assert.deepEqual(recipients.map(({ email, type, name, optedIn }) => ({ email, type, name, optedIn })), [
        { email: 'family@example.test', type: 'father', name: 'Alex Lee', optedIn: true },
        { email: 'student@example.test', type: 'student', name: 'Ava Lee', optedIn: false },
    ]);
});

test('linked student portal email is available from the student record without opt-in', () => {
    const student = {
        firstName: 'Ava',
        lastName: 'Lee',
        user: { email: 'ava@example.test' },
    };
    assert.deepEqual(buildPlpEmailRecipientCandidates(student, []), [{
        email: 'ava@example.test',
        type: 'student',
        name: 'Ava Lee',
        optedIn: false,
    }]);
});

test('explicitly opted-out contacts are excluded while contacts without a preference remain available', () => {
    const student = {
        firstName: 'Ava',
        parentInfo: {
            fatherEmail: 'no-preference@example.test',
            motherEmail: 'opted-out@example.test',
        },
    };
    assert.deepEqual(buildPlpEmailRecipientCandidates(student, [
        { recipientEmail: 'opted-out@example.test', optedIn: false, revokedAt: new Date() },
    ]).map(({ email }) => email), ['no-preference@example.test']);
});

test('family email includes allowlisted progress only and escapes HTML', () => {
    const email = buildPlpProgressEmail({
        student: { firstName: '<Ava>', lastName: 'Lee' },
        record: { academicYear: '2026-2027', month: 10 },
        goals: [{
            title: '<Build confidence>',
            successCriteria: 'Ask for help',
            status: 'active',
            teacherProgressNote: 'private',
            reviewNote: 'internal',
        }],
        tasks: [{
            title: 'Read a story',
            instructions: 'Read at home',
            status: 'assigned',
            studentCompletionNote: 'private work',
        }],
    });
    assert.match(email.text, /Build confidence/);
    assert.doesNotMatch(email.text, /private|internal/);
    assert.match(email.html, /&lt;Ava&gt;/);
    assert.doesNotMatch(email.html, /<Ava>/);
});

test('delivery policy blocks accidental duplicate sends and allows explicit resends', () => {
    const previous = { status: 'sent', attempt: 1 };
    assert.deepEqual(getPlpEmailDeliveryAttempt(previous), {
        blocked: true,
        reason: 'duplicate_blocked',
        attempt: 1,
    });
    assert.deepEqual(getPlpEmailDeliveryAttempt(previous, { resend: true }), {
        blocked: false,
        reason: '',
        attempt: 2,
    });
});

test('delivery policy blocks active attempts and permits stale or failed retries', () => {
    const now = Date.now();
    assert.equal(getPlpEmailDeliveryAttempt({
        status: 'sending',
        attempt: 1,
        startedAt: new Date(now - 60_000),
    }, { now }).reason, 'sending');
    assert.equal(getPlpEmailDeliveryAttempt({
        status: 'sending',
        attempt: 1,
        startedAt: new Date(now - 11 * 60_000),
    }, { now }).attempt, 2);
    assert.equal(getPlpEmailDeliveryAttempt({ status: 'failed', attempt: 2 }).attempt, 3);
});
