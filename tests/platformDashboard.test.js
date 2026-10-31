import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildDemoFunnel,
    buildMonthKeys,
    buildSchoolBuckets,
    mergeSeries,
    normalizeMonthlyAmount,
    resolveRangeWindow,
} from '../controllers/platformDashboardController.js';

test('normalizeMonthlyAmount keeps monthly prices and spreads yearly ones', () => {
    assert.equal(normalizeMonthlyAmount(29, 'month'), 29);
    assert.equal(normalizeMonthlyAmount(1200, 'year'), 100);
    assert.equal(normalizeMonthlyAmount('79', undefined), 79);
});

test('normalizeMonthlyAmount ignores missing or invalid amounts', () => {
    assert.equal(normalizeMonthlyAmount(undefined, 'month'), 0);
    assert.equal(normalizeMonthlyAmount(-5, 'month'), 0);
    assert.equal(normalizeMonthlyAmount('abc', 'month'), 0);
});

test('resolveRangeWindow burns the requested number of days', () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    const { key, start } = resolveRangeWindow('30d', now);
    assert.equal(key, '30d');
    assert.equal(start.toISOString(), '2026-10-01T12:00:00.000Z');
});

test('resolveRangeWindow falls back to 90 days for unknown input', () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    const { key, start } = resolveRangeWindow('forever', now);
    assert.equal(key, '90d');
    assert.equal(start.toISOString(), '2026-08-02T12:00:00.000Z');
});

test('buildSchoolBuckets counts subscription statuses, plans and disabled schools', () => {
    const result = buildSchoolBuckets([
        { isActive: true, subscription: { status: 'active', plan: 'professional' } },
        { isActive: true, subscription: { status: 'active', plan: 'starter' } },
        { isActive: true, subscription: { status: 'trial', plan: 'starter' } },
        { isActive: false, subscription: { status: 'past_due', plan: 'enterprise' } },
        { isActive: true, subscription: { status: 'inactive', plan: 'starter' } },
    ]);

    assert.equal(result.total, 5);
    assert.equal(result.active, 2);
    assert.equal(result.trial, 1);
    assert.equal(result.pastDue, 1);
    assert.equal(result.inactive, 1);
    assert.equal(result.disabled, 1);
    assert.deepEqual(result.byPlan, [
        { plan: 'starter', count: 3 },
        { plan: 'enterprise', count: 1 },
        { plan: 'professional', count: 1 },
    ]);
});

test('buildSchoolBuckets tolerates schools without a subscription block', () => {
    const result = buildSchoolBuckets([{ isActive: true }, {}]);
    assert.equal(result.total, 2);
    assert.equal(result.trial, 2);
    assert.deepEqual(result.byPlan, [{ plan: 'starter', count: 2 }]);
});

test('buildMonthKeys returns the last months in UTC, oldest first', () => {
    const keys = buildMonthKeys(new Date('2026-01-15T23:30:00.000Z'), 12);
    assert.equal(keys.length, 12);
    assert.equal(keys[0], '2025-02');
    assert.equal(keys[11], '2026-01');

    assert.deepEqual(
        buildMonthKeys(new Date('2026-10-31T12:00:00.000Z'), 3),
        ['2026-08', '2026-09', '2026-10']
    );
});

test('mergeSeries keeps every month and fills missing buckets with zero', () => {
    const series = mergeSeries(['2026-09', '2026-10'], {
        invoiced: [{ _id: '2026-10', total: 1200 }],
        collected: [{ _id: '2026-10', total: 400 }],
        newSchools: [{ _id: '2026-09', count: 2 }],
        newStudents: [{ _id: '2026-10', count: 31 }],
    });

    assert.deepEqual(series, [
        { month: '2026-09', invoiced: 0, collected: 0, newSchools: 2, newStudents: 0 },
        { month: '2026-10', invoiced: 1200, collected: 400, newSchools: 0, newStudents: 31 },
    ]);
});

test('buildDemoFunnel splits open demos by stage and age', () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    const funnel = buildDemoFunnel([
        { status: 'new', createdAt: '2026-10-31T10:00:00.000Z' },
        { status: 'new', createdAt: '2026-10-29T13:00:00.000Z' },
        { status: 'contacted', createdAt: '2026-10-28T12:00:00.000Z' },
        { status: 'contacted', createdAt: '2026-10-24T12:00:00.000Z' },
        { status: 'scheduled', createdAt: '2026-10-23T11:00:00.000Z' },
    ], now);

    assert.equal(funnel.total, 5);
    assert.deepEqual(funnel.byStatus, { new: 2, contacted: 2, scheduled: 1 });
    assert.deepEqual(funnel.byAge, { fresh: 2, aging: 2, overdue: 1 });
    assert.equal(funnel.oldestOpenAt, '2026-10-23T11:00:00.000Z');
});

test('buildDemoFunnel returns empty buckets when the pipeline is clear', () => {
    const funnel = buildDemoFunnel([], new Date('2026-10-31T12:00:00.000Z'));
    assert.deepEqual(funnel, {
        total: 0,
        byStatus: { new: 0, contacted: 0, scheduled: 0 },
        byAge: { fresh: 0, aging: 0, overdue: 0 },
        oldestOpenAt: null,
    });
});
