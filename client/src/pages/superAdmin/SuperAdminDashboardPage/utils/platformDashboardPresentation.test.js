import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildAttentionRows,
    buildGrowthSeries,
    buildPlanRows,
    buildRevenueSeries,
    formatCents,
    formatCount,
    formatMoney,
    formatMonth,
    formatPercent,
    formatShortDate,
    formatUpdatedAgo,
} from './platformDashboardPresentation.js';

const t = (key, options = {}) => options.defaultValue || String(key).split(':').pop();

test('buildPlanRows turns counts into shares of the whole', () => {
    const rows = buildPlanRows({
        schools: { byPlan: [{ plan: 'starter', count: 3 }, { plan: 'professional', count: 1 }] },
    });
    assert.deepEqual(rows, [
        { plan: 'starter', count: 3, percent: 75 },
        { plan: 'professional', count: 1, percent: 25 },
    ]);
});

test('buildPlanRows handles an empty platform', () => {
    assert.deepEqual(buildPlanRows({ schools: { byPlan: [] } }), []);
    assert.deepEqual(buildPlanRows(null), []);
});

test('buildAttentionRows orders by decision urgency and drops zeros', () => {
    const rows = buildAttentionRows(
        {
            attention: {
                trialsEnding: { count: 1, items: [{ name: 'Alpha', date: '2026-11-03T00:00:00.000Z' }] },
                billingIssues: { count: 1, items: [{ name: 'Beta', status: 'past_due' }] },
                renewalsSoon: { count: 2, items: [] },
                inactiveSchools: { count: 1, items: [] },
                demosOver48h: { count: 3, oldestAt: '2026-10-24T00:00:00.000Z' },
                upgradeRequests: { count: 1 },
                creditRequests: { count: 1 },
            },
        },
        t,
        'en-US'
    );

    assert.deepEqual(
        rows.map((row) => row.key),
        ['trials', 'billing', 'renewals', 'demos', 'credits', 'upgrades', 'inactive']
    );
    assert.equal(rows[0].count, 1);
    assert.equal(rows[0].meta, 'Alpha · Nov 3');
    assert.equal(rows[1].meta, 'Beta · past_due');
    assert.equal(rows[3].meta, 'attention.oldest');

    const sparse = buildAttentionRows(
        {
            attention: {
                trialsEnding: { count: 0, items: [] },
                billingIssues: { count: 0, items: [] },
                renewalsSoon: { count: 2, items: [] },
                inactiveSchools: { count: 0, items: [] },
                demosOver48h: { count: 3 },
                upgradeRequests: { count: 0 },
                creditRequests: { count: 1 },
            },
        },
        t,
        'en-US'
    );
    assert.deepEqual(sparse.map((row) => row.key), ['renewals', 'demos', 'credits']);
});

test('buildAttentionRows returns nothing when the inbox is clear', () => {
    assert.deepEqual(buildAttentionRows({ attention: {} }, t), []);
    assert.deepEqual(buildAttentionRows(null, t), []);
});

test('formatters keep numbers and dates readable', () => {
    assert.equal(formatCount(1234, 'en-US'), '1,234');
    assert.equal(formatMoney(1234.5, 'en-US'), '$1,234.50');
    assert.equal(formatMoney(1200, 'en-US'), '$1,200');
    assert.equal(formatCents(3150, 'en-US'), '$31.50');
    assert.equal(formatShortDate('2026-10-31T00:00:00.000Z', 'en-US'), 'Oct 31');
    assert.equal(formatShortDate(null, 'en-US'), null);
    assert.equal(formatPercent(0.834, 'en-US'), '83%');
    assert.equal(formatPercent(null, 'en-US'), null);
    assert.equal(formatMonth('2026-10', 'en-US'), 'Oct');
});

test('buildRevenueSeries scales bars, sums totals and derives the collection rate', () => {
    const result = buildRevenueSeries([
        { month: '2026-09', invoiced: 1000, collected: 500 },
        { month: '2026-10', invoiced: 500, collected: 500 },
    ], 'en-US');

    assert.equal(result.hasData, true);
    assert.deepEqual(result.totals.invoiced, 1500);
    assert.deepEqual(result.totals.collected, 1000);
    assert.ok(Math.abs(result.totals.rate - 1000 / 1500) < 1e-9);
    assert.deepEqual(
        result.rows.map((row) => [row.label, row.invoicedPct, row.collectedPct]),
        [['Sep', 100, 50], ['Oct', 50, 50]]
    );
});

test('buildRevenueSeries keeps empty months and reports no data', () => {
    const result = buildRevenueSeries([{ month: '2026-10', invoiced: 0, collected: 0 }], 'en-US');
    assert.equal(result.hasData, false);
    assert.equal(result.totals.rate, null);
    assert.equal(result.rows[0].invoicedPct, 0);
    assert.equal(buildRevenueSeries(undefined).rows.length, 0);
});

test('buildGrowthSeries totals schools and students and scales student bars', () => {
    const result = buildGrowthSeries([
        { month: '2026-09', newSchools: 1, newStudents: 10 },
        { month: '2026-10', newSchools: 2, newStudents: 20 },
    ], 'en-US');

    assert.equal(result.hasData, true);
    assert.deepEqual(result.totals, { schools: 3, students: 30 });
    assert.deepEqual(
        result.rows.map((row) => [row.label, row.newStudents, row.studentsPct]),
        [['Sep', 10, 50], ['Oct', 20, 100]]
    );
    assert.equal(buildGrowthSeries([]).hasData, false);
});

test('formatUpdatedAgo uses relative wording instead of a translated count', () => {
    const now = new Date('2026-10-31T12:00:00.000Z').getTime();
    assert.equal(formatUpdatedAgo('2026-10-31T11:57:00.000Z', 'en-US', now), '3 minutes ago');
    assert.equal(formatUpdatedAgo('2026-10-31T11:30:00.000Z', 'en-US', now), '30 minutes ago');
    assert.equal(formatUpdatedAgo('2026-10-31T10:00:00.000Z', 'en-US', now), '2 hours ago');
    assert.equal(formatUpdatedAgo('2026-10-29T12:00:00.000Z', 'en-US', now), '2 days ago');
    assert.equal(formatUpdatedAgo(null, 'en-US', now), null);
});
