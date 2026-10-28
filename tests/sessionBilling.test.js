import test from 'node:test';
import assert from 'node:assert/strict';

import {
    amountFromMinutes,
    billableMsFromSegments,
    buildLessonCharge,
    estimateMinutesRemaining,
    getPauseWindows,
    getPresenceSegments,
    getSessionWindow,
    minutesFromMs,
    resolveHourlyRate,
    roundBillableMinutes,
    summarizeEntries
} from '../services/sessionBillingMath.js';

const at = (iso) => new Date(iso);

const studentEvent = (type, iso, studentId = 'user-1') => ({
    type,
    at: at(iso),
    actor: { role: 'student', userId: studentId },
    payload: { studentId }
});

const session = (start, end, extra = {}) => ({
    startedAt: at(start),
    endedAt: end ? at(end) : null,
    ...extra
});

const minutesFor = (events, sessionDoc, studentId = 'user-1') => {
    const window = getSessionWindow(sessionDoc);
    const presence = getPresenceSegments(events, window);
    const pauses = getPauseWindows(events, sessionDoc);
    const segments = presence.get(studentId) || [];
    return minutesFromMs(billableMsFromSegments(segments, pauses));
};

test('presence segments merge reconnects and clamp to the session window', () => {
    const sessionDoc = session('2026-10-27T10:00:00Z', '2026-10-27T10:30:00Z');
    const events = [
        studentEvent('presence:joined', '2026-10-27T09:55:00Z'),
        studentEvent('presence:left', '2026-10-27T10:20:00Z'),
        studentEvent('presence:joined', '2026-10-27T10:25:00Z')
    ];
    assert.equal(minutesFor(events, sessionDoc), 25);
});

test('a duplicate join does not restart the clock', () => {
    const sessionDoc = session('2026-10-27T10:00:00Z', '2026-10-27T10:30:00Z');
    const events = [
        studentEvent('presence:joined', '2026-10-27T10:00:00Z'),
        studentEvent('presence:joined', '2026-10-27T10:10:00Z'),
        studentEvent('presence:left', '2026-10-27T10:30:00Z')
    ];
    assert.equal(minutesFor(events, sessionDoc), 30);
});

test('paused lesson time is not billable', () => {
    const sessionDoc = session('2026-10-27T10:00:00Z', '2026-10-27T11:00:00Z');
    const events = [
        studentEvent('presence:joined', '2026-10-27T10:00:00Z'),
        { type: 'session:paused', at: at('2026-10-27T10:20:00Z'), actor: { role: 'teacher' }, payload: {} },
        { type: 'session:resumed', at: at('2026-10-27T10:35:00Z'), actor: { role: 'teacher' }, payload: {} }
    ];
    assert.equal(minutesFor(events, sessionDoc), 45);
});

test('time after a student leaves is not billable', () => {
    const sessionDoc = session('2026-10-27T10:00:00Z', '2026-10-27T11:00:00Z');
    const events = [
        studentEvent('presence:joined', '2026-10-27T10:00:00Z'),
        studentEvent('presence:left', '2026-10-27T10:12:00Z')
    ];
    assert.equal(minutesFor(events, sessionDoc), 12);
});

test('rounding steps up and the minimum applies to attended sessions only', () => {
    const settings = { roundingMinutes: 5, minimumBillableMinutes: 15, noShowMinutes: 0 };
    assert.equal(roundBillableMinutes(12.4, settings), 15);
    assert.equal(roundBillableMinutes(16.1, settings), 20);
    assert.equal(roundBillableMinutes(2, settings), 15);
    assert.equal(roundBillableMinutes(0, settings), 0);
    assert.equal(roundBillableMinutes(0, { ...settings, noShowMinutes: 10 }), 10);
});

test('a class rate overrides the school default', () => {
    const settings = {
        defaultHourlyRate: 30,
        classRates: [{ classId: 'class-1', hourlyRate: 40 }]
    };
    assert.deepEqual(
        resolveHourlyRate(settings, { classId: 'class-1' }),
        { rate: 40, source: 'class', reason: '' }
    );
    assert.deepEqual(
        resolveHourlyRate(settings, { classId: 'class-2' }),
        { rate: 30, source: 'school', reason: '' }
    );
});

test('amounts are rounded to cents', () => {
    assert.equal(amountFromMinutes(45, 40), 30);
    assert.equal(amountFromMinutes(7, 50), 5.83);
    assert.equal(amountFromMinutes(0, 40), 0);
});

test('manual lesson time uses the same rounding, minimum, and rate rules', () => {
    const settings = {
        roundingMinutes: 5,
        minimumBillableMinutes: 15,
        defaultHourlyRate: 30,
        classRates: [{ classId: 'class-1', hourlyRate: 40 }]
    };
    assert.deepEqual(
        buildLessonCharge(47, settings, { classId: 'class-1' }),
        { minutes: 50, hourlyRate: 40, rateSource: 'class', rateReason: '', basis: 'attended', amount: 33.33 }
    );
    assert.deepEqual(
        buildLessonCharge(8, settings, { classId: 'class-2' }),
        { minutes: 15, hourlyRate: 30, rateSource: 'school', rateReason: '', basis: 'attended', amount: 7.5 }
    );
});

test('balance is payments minus charges and ignores voided rows', () => {
    const totals = summarizeEntries([
        { kind: 'charge', amount: 30, minutes: 45, session: 's1', status: 'active' },
        { kind: 'charge', amount: 20, minutes: 30, session: 's2', status: 'void' },
        { kind: 'payment', amount: 100, status: 'active' }
    ]);
    assert.deepEqual(totals, { charged: 30, paid: 100, refunded: 0, credited: 0, debited: 0, minutes: 45, sessions: 1, balance: 70 });
});

test('manual charges count as lessons even without a platform session', () => {
    const totals = summarizeEntries([
        { kind: 'charge', amount: 40, minutes: 60, session: null, status: 'active' },
        { kind: 'payment', amount: 40, status: 'active' }
    ]);
    assert.deepEqual(totals, { charged: 40, paid: 40, refunded: 0, credited: 0, debited: 0, minutes: 60, sessions: 1, balance: 0 });
});

test('remaining minutes come from the balance at the current rate', () => {
    assert.equal(estimateMinutesRemaining(70, 40), 105);
    assert.equal(estimateMinutesRemaining(-5, 40), 0);
    assert.equal(estimateMinutesRemaining(70, 0), 0);
});
