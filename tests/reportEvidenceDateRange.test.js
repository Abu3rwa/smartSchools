import test from 'node:test';
import assert from 'node:assert/strict';
import Attendance from '../models/Attendance.js';
import { collect as collectAttendance } from '../services/reportEvidence/attendance.js';
import { startOfDay, endOfDay } from '../services/reportEvidence/dateRange.js';

test('endOfDay accepts the Date objects the controller passes', () => {
    const end = endOfDay(new Date('2026-10-31T00:00:00.000Z'));

    assert.ok(end instanceof Date);
    assert.equal(Number.isNaN(end.getTime()), false);
    assert.equal(end.getHours(), 23);
    assert.equal(end.getMinutes(), 59);
    assert.equal(end.getSeconds(), 59);
    assert.equal(end.getMilliseconds(), 999);
});

test('endOfDay still accepts ISO strings and rejects nothing that is valid', () => {
    const fromString = endOfDay('2026-10-31');
    assert.equal(fromString.getHours(), 23);
    assert.equal(startOfDay('2026-10-31').getHours(), 0);
    assert.equal(endOfDay(null), null);
    assert.equal(endOfDay('not-a-date'), null);
});

test('the previous string-concatenation produced an Invalid Date', () => {
    // This is the bug that made every source but grades report "Could not be read":
    // the collector received a Date and appended a time suffix to its string form.
    const broken = new Date(`${new Date('2026-10-31T00:00:00.000Z')}T23:59:59.999Z`);
    assert.equal(Number.isNaN(broken.getTime()), true);
});

test('the attendance collector queries Mongo with a valid end-of-day Date', async (t) => {
    let capturedQuery;

    t.mock.method(Attendance, 'find', (query) => {
        capturedQuery = query;
        return {
            sort: () => ({ lean: async () => [] })
        };
    });

    const result = await collectAttendance({
        schoolId: '507f1f77bcf86cd799439011',
        studentId: '507f1f77bcf86cd799439012',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-31T00:00:00.000Z')
    });

    assert.ok(capturedQuery.date.$lte instanceof Date);
    assert.equal(Number.isNaN(capturedQuery.date.$lte.getTime()), false);
    assert.equal(capturedQuery.date.$lte.getHours(), 23);
    // No records is "no data", not a failure.
    assert.equal(result.available, false);
    assert.equal(result.source, 'attendance');
});
