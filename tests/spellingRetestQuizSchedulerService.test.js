import test from 'node:test';
import assert from 'node:assert/strict';
import { selectRetestQuizItems } from '../services/spellingRetestQuizSchedulerService.js';

test('retest quiz selection includes every due word and prioritizes least-confident words', () => {
    const items = [
        { _id: 'more-confident', correctRetestStreak: 2, incorrectRetestCount: 0, lastRetestedAt: null, dueAt: new Date('2026-10-01'), flaggedAt: new Date('2026-09-01') },
        { _id: 'least-confident', correctRetestStreak: 0, incorrectRetestCount: 2, lastRetestedAt: new Date('2026-10-01'), dueAt: new Date('2026-10-02'), flaggedAt: new Date('2026-09-20') },
        { _id: 'some-confidence', correctRetestStreak: 1, incorrectRetestCount: 0, lastRetestedAt: new Date('2026-09-10'), dueAt: new Date('2026-10-04'), flaggedAt: new Date('2026-09-02') }
    ];

    assert.deepEqual(selectRetestQuizItems(items).map((item) => item._id), ['least-confident', 'some-confidence', 'more-confident']);
});

test('retest quiz selection uses earliest missed words when review history is equal', () => {
    const items = [
        { _id: 'newer', lastRetestedAt: null, dueAt: new Date('2026-10-02'), flaggedAt: new Date('2026-09-02') },
        { _id: 'older', lastRetestedAt: null, dueAt: new Date('2026-10-02'), flaggedAt: new Date('2026-09-01') }
    ];

    assert.deepEqual(selectRetestQuizItems(items).map((item) => item._id), ['older', 'newer']);
});
