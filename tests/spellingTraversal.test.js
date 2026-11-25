import test from 'node:test';
import assert from 'node:assert/strict';
import {
    activeWords,
    eligibleWords,
    isGradeTraversalComplete,
    nextEligibleWord,
    projectCompletion,
    sortForTraversal
} from '../services/spellingTraversal.js';

const word = (id, week, order, extra = {}) => ({
    _id: id,
    week,
    order,
    word: `word-${id}`,
    ...extra
});

const grade = () => [
    word('a', 1, 1),
    word('b', 1, 2),
    word('c', 2, 1),
    word('d', 2, 2),
    word('e', 3, 1)
];

/** Deterministic permutations; no randomness so a failure is reproducible. */
const permutations = (items) => {
    if (items.length <= 1) return [items];
    const result = [];
    for (let index = 0; index < items.length; index += 1) {
        const rest = [...items.slice(0, index), ...items.slice(index + 1)];
        for (const tail of permutations(rest)) result.push([items[index], ...tail]);
    }
    return result;
};

const rotation = (items, by) => [...items.slice(by), ...items.slice(0, by)];

test('archived words are never active or eligible', () => {
    const words = [...grade(), word('gone', 1, 3, { deletedAt: new Date() })];
    assert.deepEqual(activeWords(words).map((entry) => entry._id), ['a', 'b', 'c', 'd', 'e']);
    assert.equal(
        eligibleWords({ words, floorWeek: 1 }).some((entry) => entry._id === 'gone'),
        false
    );
});

test('traversal sorts by week, then order, then id regardless of input order', () => {
    const shuffled = ['d', 'a', 'e', 'c', 'b'].map((id) => grade().find((entry) => entry._id === id));
    assert.deepEqual(sortForTraversal(shuffled).map((entry) => entry._id), ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(
        sortForTraversal([word('z', 1, 1), word('y', 1, 1)]).map((entry) => entry._id),
        ['y', 'z']
    );
});

test('the placement floor removes earlier weeks from eligibility', () => {
    const eligible = eligibleWords({ words: grade(), floorWeek: 2 });
    assert.deepEqual(eligible.map((entry) => entry._id), ['c', 'd', 'e']);
});

test('the next word skips every consumed identity and never skips an unconsumed one', () => {
    const words = grade();
    assert.equal(nextEligibleWord({ words, consumedIds: [], floorWeek: 1 })._id, 'a');
    assert.equal(nextEligibleWord({ words, consumedIds: ['a'], floorWeek: 1 })._id, 'b');
    // Consuming later words does not let the reader jump the gap.
    assert.equal(nextEligibleWord({ words, consumedIds: ['a', 'c', 'd'], floorWeek: 1 })._id, 'b');
    assert.equal(
        nextEligibleWord({ words, consumedIds: ['a', 'b', 'c', 'd', 'e'], floorWeek: 1 }),
        null
    );
    assert.equal(nextEligibleWord({ words, consumedIds: ['a', 'b'], floorWeek: 2 })._id, 'c');
});

test('the projection is the contiguous consumed prefix, not the highest consumed row', () => {
    const words = grade();
    assert.deepEqual(
        projectCompletion({ words, consumedIds: [], floorWeek: 1 }),
        { week: 1, order: 1, lastWordIndex: 0, completed: false, total: 5 }
    );
    assert.deepEqual(
        projectCompletion({ words, consumedIds: ['a', 'b'], floorWeek: 1 }),
        { week: 1, order: 2, lastWordIndex: 2, completed: false, total: 5 }
    );
    // c is consumed but b is not: the pointer must stop at the first gap.
    assert.deepEqual(
        projectCompletion({ words, consumedIds: ['a', 'c', 'd', 'e'], floorWeek: 1 }),
        { week: 1, order: 1, lastWordIndex: 1, completed: false, total: 5 }
    );
    assert.deepEqual(
        projectCompletion({ words, consumedIds: ['a', 'b', 'c', 'd', 'e'], floorWeek: 1 }),
        { week: 3, order: 1, lastWordIndex: 1, completed: true, total: 5 }
    );
});

test('the projection never counts words below the placement floor', () => {
    const words = grade();
    const projection = projectCompletion({ words, consumedIds: ['c'], floorWeek: 2 });
    assert.deepEqual(projection, { week: 2, order: 1, lastWordIndex: 1, completed: false, total: 3 });
});

test('an empty eligible grade reports no projection and is not complete', () => {
    assert.deepEqual(
        projectCompletion({ words: [], consumedIds: [], floorWeek: 1 }),
        { week: null, order: null, lastWordIndex: 0, completed: false, total: 0 }
    );
    assert.deepEqual(
        isGradeTraversalComplete({ words: [], consumedIds: [], floorWeek: 1 }),
        { complete: false, empty: true }
    );
});

test('grade completion requires every eligible identity to be consumed', () => {
    const words = grade();
    assert.deepEqual(
        isGradeTraversalComplete({ words, consumedIds: ['a', 'b', 'c', 'd'], floorWeek: 1 }),
        { complete: false, empty: false }
    );
    assert.deepEqual(
        isGradeTraversalComplete({ words, consumedIds: ['a', 'b', 'c', 'd', 'e'], floorWeek: 1 }),
        { complete: true, empty: false }
    );
    assert.deepEqual(
        isGradeTraversalComplete({ words, consumedIds: ['c', 'd', 'e'], floorWeek: 2 }),
        { complete: true, empty: false }
    );
});

test('set membership inputs are accepted as well as arrays', () => {
    const words = grade();
    const consumed = new Set(['a', 'b']);
    assert.equal(nextEligibleWord({ words, consumedIds: consumed, floorWeek: 1 })._id, 'c');
    assert.equal(projectCompletion({ words, consumedIds: consumed, floorWeek: 1 }).order, 2);
});

test('reordering the same identities cannot change the next word or the projection', () => {
    const words = grade();
    const consumedIds = ['a', 'b', 'd'];
    const expectedNext = 'c';
    const expectedProjection = projectCompletion({ words, consumedIds, floorWeek: 1 });
    // Rotations only: full 5! permutations would be too slow for no extra proof.
    for (let offset = 0; offset < words.length; offset += 1) {
        const shuffled = rotation(words, offset);
        assert.equal(nextEligibleWord({ words: shuffled, consumedIds, floorWeek: 1 })._id, expectedNext);
        assert.deepEqual(projectCompletion({ words: shuffled, consumedIds, floorWeek: 1 }), expectedProjection);
    }
});

test('inserting a new identity below the pointer makes it the next unanswered word', () => {
    const before = grade();
    const inserted = word('inserted', 1, 1.5);
    const consumedIds = ['a', 'b'];
    assert.equal(
        nextEligibleWord({ words: before, consumedIds, floorWeek: 1 })._id,
        'c',
        'the pointer reaches week 2 before the insert'
    );
    const after = [...before, inserted];
    // Insertion changes orders elsewhere, but identity consumption is unchanged:
    // a and b stay consumed, the inserted word is unseen and comes first.
    assert.equal(nextEligibleWord({ words: after, consumedIds, floorWeek: 1 })._id, 'inserted');
});

test('removing an unconsumed identity skips no consumed identity', () => {
    const words = grade().filter((entry) => entry._id !== 'c');
    const consumedIds = ['a', 'b'];
    assert.equal(nextEligibleWord({ words, consumedIds, floorWeek: 1 })._id, 'd');
});

test('permuting input order cannot make a consumed identity eligible again', () => {
    const words = grade();
    const consumedIds = ['a', 'b', 'c'];
    const expectedNext = 'd';
    const orders = permutations(words).slice(0, 32);
    assert.equal(orders.length, 32);
    for (const order of orders) {
        assert.equal(nextEligibleWord({ words: order, consumedIds, floorWeek: 1 })._id, expectedNext);
        const projection = projectCompletion({ words: order, consumedIds, floorWeek: 1 });
        assert.deepEqual([projection.week, projection.order, projection.lastWordIndex], [2, 1, 1]);
    }
});
