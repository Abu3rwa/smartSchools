import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildAttendanceSegments,
    formatDelta,
    formatMonthKeyLabel,
    formatPercent,
} from './schoolAdminDashboardPresentation.js';

test('splits today attendance into proportional segments', () => {
    assert.deepEqual(
        buildAttendanceSegments({ totalStudents: 100, present: 80, late: 10, absent: 10 }),
        [
            { key: 'present', percent: 80 },
            { key: 'late', percent: 10 },
            { key: 'absent', percent: 10 },
        ]
    );
});

test('drops empty segments and guards against a zero total', () => {
    assert.deepEqual(
        buildAttendanceSegments({ totalStudents: 50, present: 50, late: 0, absent: 0 }),
        [{ key: 'present', percent: 100 }]
    );
    assert.deepEqual(buildAttendanceSegments({ totalStudents: 0, present: 0 }), []);
    assert.deepEqual(buildAttendanceSegments(null), []);
});

test('formats percentages without a trailing zero', () => {
    assert.equal(formatPercent(94.2), '94.2%');
    assert.equal(formatPercent(100), '100%');
    assert.equal(formatPercent(null), null);
});

test('formats deltas with an explicit plus for additions', () => {
    assert.equal(formatDelta(12), '+12');
    assert.equal(formatDelta(0), '0');
    assert.equal(formatDelta(undefined), '0');
});

test('turns month keys into short labels', () => {
    assert.equal(formatMonthKeyLabel('2026-10', 'en'), 'Oct');
    assert.equal(formatMonthKeyLabel('2026-01', 'en'), 'Jan');
    assert.equal(formatMonthKeyLabel('', 'en'), '');
});
