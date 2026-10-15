import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeGoalMilestones, parseOptionalPlpDate } from '../services/plpGoalProgressService.js';

test('goal milestone normalization trims titles and assigns valid defaults', () => {
    const milestones = normalizeGoalMilestones([{ title: '  Read three books  ' }, { title: 'Use a reading strategy', status: 'achieved' }]);
    assert.equal(milestones[0].title, 'Read three books');
    assert.equal(milestones[0].status, 'pending');
    assert.equal(milestones[0].completedAt, null);
    assert.equal(milestones[1].status, 'achieved');
    assert.ok(milestones[1].completedAt instanceof Date);
});

test('goal milestone validation rejects invalid count, title and status', () => {
    assert.throws(() => normalizeGoalMilestones(Array.from({ length: 11 }, (_, index) => ({ title: `Step ${index}` }))), /no more than 10/);
    assert.throws(() => normalizeGoalMilestones([{ title: ' ' }]), /needs a title/);
    assert.throws(() => normalizeGoalMilestones([{ title: 'Step', status: 'completed' }]), /status is invalid/);
});

test('optional check-in date preserves empty values and rejects invalid dates', () => {
    assert.equal(parseOptionalPlpDate('', 'Check-in date'), null);
    assert.ok(parseOptionalPlpDate('2026-11-15', 'Check-in date') instanceof Date);
    assert.throws(() => parseOptionalPlpDate('not-a-date', 'Check-in date'), /Check-in date is invalid/);
});
