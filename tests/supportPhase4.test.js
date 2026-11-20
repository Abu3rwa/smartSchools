import assert from 'node:assert/strict';
import test from 'node:test';

import {
    boundedAckDays,
    boundedDays,
    boundedReminders,
    addDays,
    addSchoolDays,
} from '../services/supportReminderService.js';
import {
    buildInviteMessage,
    earliestDueDate,
    groupSurveysForSend,
    invitationDedupeKey,
    respondentCodeSnapshot,
    restoreRespondentCode,
} from '../services/supportEmailService.js';

/* ------------------------- settings bound helpers -------------------------- */

test('zero reminders means zero, never the default', () => {
    assert.equal(boundedReminders(0), 0);
    assert.equal(boundedReminders('0'), 0);
});

test('a missing or invalid reminder count falls back to the default', () => {
    assert.equal(boundedReminders(undefined), 2);
    assert.equal(boundedReminders(null), 2);
    assert.equal(boundedReminders('abc'), 2);
    assert.equal(boundedReminders(12), 5);
    assert.equal(boundedReminders(-1), 0);
});

test('reminder interval bounds keep zero inside the valid range', () => {
    assert.equal(boundedDays(0), 1);
    assert.equal(boundedDays(45), 30);
    assert.equal(boundedDays(undefined), 3);
});

test('the acknowledgment window defaults to two school days', () => {
    assert.equal(boundedAckDays(undefined), 2);
    assert.equal(boundedAckDays(0), 1);
    assert.equal(boundedAckDays(30), 10);
});

/* ----------------------------- school days --------------------------------- */

test('school days skip the Friday/Saturday weekend', () => {
    // 2026-01-01 is a Thursday.
    const thursday = new Date(2026, 0, 1, 12, 0, 0);
    const friday = addSchoolDays(thursday, 1);
    assert.equal(friday.getDay(), 0); // Friday and Saturday skipped -> Sunday
    assert.deepEqual(friday, new Date(2026, 0, 4, 12, 0, 0));

    const monday = addSchoolDays(thursday, 2);
    assert.equal(monday.getDay(), 1);
    assert.deepEqual(monday, new Date(2026, 0, 5, 12, 0, 0));
});

test('a mid-week span needs no weekend skipping', () => {
    const monday = new Date(2026, 0, 5, 9, 0, 0);
    assert.deepEqual(addSchoolDays(monday, 3), new Date(2026, 0, 8, 9, 0, 0));
});

test('addDays is plain calendar arithmetic', () => {
    assert.deepEqual(addDays(new Date(2026, 0, 1), 3), new Date(new Date(2026, 0, 1).getTime() + 3 * 86_400_000));
});

/* ------------------------- grouped invitations ----------------------------- */

const stubSurvey = (overrides = {}) => ({
    _id: 's1',
    respondent: { _id: 'r1' },
    subject: { name: 'Math' },
    dueDate: null,
    ...overrides,
});

test('surveys group by respondent so one person gets one email', () => {
    const { groups, skips } = groupSurveysForSend([
        stubSurvey({ _id: 's1', respondent: { _id: 'r1' } }),
        stubSurvey({ _id: 's2', respondent: { _id: 'r1' }, subject: { name: 'Science' } }),
        stubSurvey({ _id: 's3', respondent: { _id: 'r2' } }),
    ]);
    assert.equal(groups.size, 2);
    assert.deepEqual(groups.get('r1').map((row) => row._id), ['s1', 's2']);
    assert.deepEqual(groups.get('r2').map((row) => row._id), ['s3']);
    assert.deepEqual(skips, []);
});

test('a survey without a respondent is skipped, not grouped', () => {
    const { groups, skips } = groupSurveysForSend([
        stubSurvey({ _id: 's1', respondent: null }),
    ]);
    assert.equal(groups.size, 0);
    assert.equal(skips.length, 1);
    assert.equal(skips[0].reason, 'no-respondent');
});

test('an already-submitted survey is never re-invited', () => {
    const { groups, skips } = groupSurveysForSend([
        stubSurvey({ _id: 's1', status: 'submitted' }),
        stubSurvey({ _id: 's2', status: 'opened' }),
    ]);
    assert.deepEqual(groups.get('r1').map((row) => row._id), ['s2']);
    assert.equal(skips.length, 1);
    assert.equal(skips[0].reason, 'submitted');
});

test('the earliest due date in a group wins', () => {
    const group = [
        stubSurvey({ dueDate: '2026-03-10' }),
        stubSurvey({ dueDate: '2026-03-02' }),
        stubSurvey({ dueDate: null }),
    ];
    assert.equal(earliestDueDate(group), '2026-03-02');
    assert.equal(earliestDueDate([stubSurvey()]), null);
});

test('automated invitations dedupe per review; manual ones are stamped', () => {
    assert.equal(invitationDedupeKey('review:abc123', 'r1'), 'invite:review:abc123:r1');
    const manual = invitationDedupeKey(null, 'r1');
    assert.ok(manual.startsWith('invite:manual:r1:'));
    assert.ok(!manual.includes('review'));
});

/* ------------------------ code rotation safety ----------------------------- */

const CODE_FIELDS = ['codeHash', 'codeHint', 'codeLookup', 'codeIssuedAt', 'failedAttempts', 'lockedUntil', 'tokenVersion'];

test('a snapshot restores every code field after a failed send', () => {
    const respondent = {
        codeHash: 'h1',
        codeHint: '34',
        codeLookup: 'lookup1',
        codeIssuedAt: new Date('2026-01-01'),
        failedAttempts: 2,
        lockedUntil: null,
        tokenVersion: 4,
    };
    const snapshot = respondentCodeSnapshot(respondent);
    // Simulate the rotation writing new values.
    for (const field of CODE_FIELDS) respondent[field] = field === 'tokenVersion' ? 5 : `new-${field}`;
    restoreRespondentCode(respondent, snapshot);
    for (const field of CODE_FIELDS) assert.deepEqual(respondent[field], snapshot[field]);
    assert.equal(respondent.tokenVersion, 4);
});

test('a snapshot of unset fields restores them as unset, not as garbage', () => {
    const respondent = { codeHint: '00' };
    const snapshot = respondentCodeSnapshot(respondent);
    assert.equal(snapshot.codeHash, undefined);
    respondent.codeHash = 'rotated';
    restoreRespondentCode(respondent, snapshot);
    assert.equal(respondent.codeHash, undefined);
});

/* --------------------------- grouped message ------------------------------- */

test('a parent invitation keeps the child-only subject line', () => {
    const message = buildInviteMessage({
        schoolName: 'AMLY',
        academicYear: '2026-2027',
        studentName: 'Sara Ahmed',
        audience: 'parent',
        dueDate: '2026-03-10',
        code: '123456',
        url: '',
    });
    assert.equal(message.subject, 'Support survey — Sara Ahmed');
    assert.match(message.text, /Your six-digit code: 123456/);
});

test('a teacher with one subject keeps the subject in the subject line', () => {
    const message = buildInviteMessage({
        schoolName: 'AMLY',
        academicYear: '2026-2027',
        studentName: 'Sara Ahmed',
        subjectName: 'Math',
        audience: 'teacher',
        dueDate: null,
        code: '123456',
        url: '',
    });
    assert.equal(message.subject, 'Support survey — Math · Sara Ahmed');
    assert.match(message.text, /Math · Sara Ahmed · AMLY/);
});

test('a teacher with several subjects gets one email listing them all', () => {
    const message = buildInviteMessage({
        schoolName: 'AMLY',
        academicYear: '2026-2027',
        studentName: 'Sara Ahmed',
        subjects: ['Math', 'Science', ''],
        audience: 'teacher',
        dueDate: '2026-03-05',
        code: '123456',
        url: '',
    });
    assert.equal(message.subject, 'Support survey — Sara Ahmed');
    assert.match(message.text, /Math, Science · Sara Ahmed · AMLY/);
    assert.match(message.text, /Please answer by 5 March 2026/);
});
