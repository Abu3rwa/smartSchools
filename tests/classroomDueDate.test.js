import assert from 'node:assert/strict';
import test from 'node:test';

import { toClassroomDue } from '../utils/classroomDueDate.js';

const dayAt = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`);

test('toClassroomDue returns null without a valid due date', () => {
    assert.equal(toClassroomDue(null, 'UTC'), null);
    assert.equal(toClassroomDue(undefined, 'UTC'), null);
    assert.equal(toClassroomDue('not-a-date', 'UTC'), null);
});

test('toClassroomDue uses end of day in UTC for a UTC school', () => {
    assert.deepEqual(toClassroomDue(dayAt('2026-10-09'), 'UTC'), {
        dueDate: { year: 2026, month: 10, day: 9 },
        dueTime: { hours: 23, minutes: 59 }
    });
});

test('toClassroomDue converts a school ahead of UTC to the same UTC day', () => {
    // 23:59 in Riyadh (UTC+3) is 20:59 UTC the same day.
    assert.deepEqual(toClassroomDue(dayAt('2026-10-09'), 'Asia/Riyadh'), {
        dueDate: { year: 2026, month: 10, day: 9 },
        dueTime: { hours: 20, minutes: 59 }
    });
});

test('toClassroomDue rolls the UTC date forward for a school behind UTC', () => {
    // 23:59 in Los Angeles (PDT, UTC-7) is 06:59 UTC the next day.
    assert.deepEqual(toClassroomDue(dayAt('2026-10-09'), 'America/Los_Angeles'), {
        dueDate: { year: 2026, month: 10, day: 10 },
        dueTime: { hours: 6, minutes: 59 }
    });
});

test('toClassroomDue respects daylight-saving changes', () => {
    // US DST ended on 2026-11-01: after that Los Angeles is UTC-8.
    assert.deepEqual(toClassroomDue(dayAt('2026-11-01'), 'America/Los_Angeles'), {
        dueDate: { year: 2026, month: 11, day: 2 },
        dueTime: { hours: 7, minutes: 59 }
    });
    assert.deepEqual(toClassroomDue(dayAt('2026-10-31'), 'America/Los_Angeles'), {
        dueDate: { year: 2026, month: 11, day: 1 },
        dueTime: { hours: 6, minutes: 59 }
    });
});

test('toClassroomDue falls back to UTC for an invalid time zone', () => {
    assert.deepEqual(toClassroomDue(dayAt('2026-10-09'), 'Not/AZone'), {
        dueDate: { year: 2026, month: 10, day: 9 },
        dueTime: { hours: 23, minutes: 59 }
    });
});
