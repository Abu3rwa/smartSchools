import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReportDateRange } from '../utils/reportDateRange.js';

test('yearly is labeled as the calendar year it actually covers', () => {
    const { period, startDate, endDate } = calculateReportDateRange('yearly', null, { now: new Date('2026-11-08T12:00:00') });
    assert.match(period, /Calendar Year 2026/);
    assert.equal(startDate.getMonth(), 0);
    assert.equal(endDate.getMonth(), 11);
});

test('custom ranges include the whole end date', () => {
    const { endDate } = calculateReportDateRange('custom', {
        startDate: '2026-11-01',
        endDate: '2026-11-08'
    });
    assert.equal(endDate.getHours(), 23);
    assert.equal(endDate.getMinutes(), 59);
    assert.equal(endDate.getDate(), 8);
});

test('reversed custom dates are rejected', () => {
    assert.throws(() => calculateReportDateRange('custom', {
        startDate: '2026-11-08',
        endDate: '2026-11-01'
    }), /order|before|after|range/i);
});

test('invalid custom dates are rejected', () => {
    assert.throws(() => calculateReportDateRange('custom', {
        startDate: 'not-a-date',
        endDate: '2026-11-01'
    }), /date|range/i);
});

test('missing custom dates are rejected', () => {
    assert.throws(() => calculateReportDateRange('custom', {}), /date|range/i);
});

test('monthly period keeps the month-year label', () => {
    const { period } = calculateReportDateRange('monthly', null, { now: new Date('2026-11-08T12:00:00') });
    assert.match(period, /November 2026/);
});