import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applySavedRows,
    createRequestTracker,
    draftIssues,
    impactEntries,
    moveWithinWeek,
    newOperationId,
    patchFromDraft,
    rowCanEdit,
    sortLibraryRows,
    weekPermutationAfterMove,
    weekRows
} from './libraryDeltas.js';

const row = (overrides = {}) => ({
    _id: 'word-1',
    grade: 'G2',
    week: 1,
    order: 1,
    word: 'red fox',
    definition: 'A wild animal',
    category: 'Review',
    revision: 3,
    ...overrides
});

test('a commit patches only the rows the server returned', () => {
    const untouched = row({ _id: 'word-2', order: 2, word: 'otter' });
    const rows = [row(), untouched];
    const next = applySavedRows(rows, {
        changedRows: [{ _id: 'word-1', definition: 'A red fox', revision: 4 }],
        addedRows: [],
        removedIds: []
    });
    const patched = next.find((entry) => entry._id === 'word-1');
    assert.equal(patched.definition, 'A red fox');
    assert.equal(patched.revision, 4);
    assert.equal(patched.word, 'red fox');
    assert.equal(next.find((entry) => entry._id === 'word-2'), untouched);
});

test('an archived word leaves the list without touching its neighbours', () => {
    const second = row({ _id: 'word-2', order: 2 });
    const next = applySavedRows([row(), second], { removedIds: ['word-1'] });
    assert.deepEqual(next, [second]);
});

test('a reorder response re-sorts and keeps every row', () => {
    const first = row({ _id: 'word-1', order: 2, revision: 4 });
    const second = row({ _id: 'word-2', order: 1, word: 'otter', revision: 2 });
    const next = applySavedRows([first, second], {
        changedRows: [
            { _id: 'word-1', order: 2, revision: 4 },
            { _id: 'word-2', order: 1, revision: 2 }
        ]
    });
    assert.deepEqual(next.map((entry) => entry._id), ['word-2', 'word-1']);
});

test('an added row is merged with its existing neighbours in position order', () => {
    const next = applySavedRows([row({ _id: 'word-1', order: 1 }), row({ _id: 'word-3', order: 3 })], {
        addedRows: [row({ _id: 'word-2', order: 2, word: 'new word', revision: 1 })]
    });
    assert.deepEqual(next.map((entry) => entry._id), ['word-1', 'word-2', 'word-3']);
});

test('row order follows grade, week, order and then word', () => {
    const sorted = sortLibraryRows([
        row({ _id: 'z', grade: 'G3', week: 1, order: 1 }),
        row({ _id: 'b', grade: 'G1', week: 9, order: 1 }),
        row({ _id: 'a', grade: 'G1', week: 2, order: 2 }),
        row({ _id: 'c', grade: 'G1', week: 2, order: 1 })
    ]);
    assert.deepEqual(sorted.map((entry) => entry._id), ['c', 'a', 'b', 'z']);
});

test('keyboard reorder swaps exactly one neighbour inside the same week', () => {
    const rows = [
        row({ _id: 'a', order: 1 }),
        row({ _id: 'b', order: 2 }),
        row({ _id: 'c', order: 3, week: 2 })
    ];
    assert.deepEqual(moveWithinWeek(rows, 'b', 'up'), ['b', 'a']);
    assert.deepEqual(moveWithinWeek(rows, 'a', 'down'), ['b', 'a']);
    assert.equal(moveWithinWeek(rows, 'a', 'up'), null);
    assert.equal(moveWithinWeek(rows, 'b', 'down'), null);
    assert.equal(moveWithinWeek(rows, 'missing', 'down'), null);
    assert.deepEqual(weekRows(rows, { grade: 'G2', week: 1 }).map((entry) => entry._id), ['a', 'b']);
});

test('a pointer move produces the exact permutation of the week', () => {
    const rows = [
        row({ _id: 'a', order: 1 }),
        row({ _id: 'b', order: 2 }),
        row({ _id: 'c', order: 3 }),
        row({ _id: 'd', order: 4 })
    ];
    assert.deepEqual(weekPermutationAfterMove(rows, 'd', 0), ['d', 'a', 'b', 'c']);
    assert.deepEqual(weekPermutationAfterMove(rows, 'a', 2), ['b', 'c', 'a', 'd']);
    assert.equal(weekPermutationAfterMove(rows, 'a', 0), null);
});

test('an unchanged draft emits no request and an edited one sends only what changed', () => {
    const current = row();
    assert.equal(patchFromDraft(current, {
        word: ' red fox ',
        definition: 'A wild animal',
        category: 'Review'
    }), null);
    assert.deepEqual(patchFromDraft(current, {
        word: 'red fox',
        definition: 'A small wild animal',
        category: 'Review'
    }), { definition: 'A small wild animal' });
});

test('draft validation reports every blocking field', () => {
    assert.deepEqual(draftIssues({ word: '  ', definition: '', category: '' }), ['WORD_REQUIRED', 'CATEGORY_REQUIRED']);
    assert.deepEqual(draftIssues({
        word: 'x'.repeat(201),
        category: 'c'.repeat(121),
        definition: 'd'.repeat(2001)
    }), ['WORD_TOO_LONG', 'CATEGORY_TOO_LONG', 'DEFINITION_TOO_LONG']);
    assert.deepEqual(draftIssues({ word: 'otter', category: 'Animals', definition: '' }), []);
});

test('a stale page response cannot replace a newer request', () => {
    const tracker = createRequestTracker();
    const first = tracker.begin();
    const second = tracker.begin();
    assert.equal(tracker.isCurrent(first), false);
    assert.equal(tracker.isCurrent(second), true);
    tracker.cancel();
    assert.equal(tracker.isCurrent(second), false);
});

test('operation ids are long enough for the audit envelope', () => {
    const first = newOperationId();
    const second = newOperationId();
    assert.ok(first.length >= 8);
    assert.notEqual(first, second);
});

test('permission follows the returned row and falls back to grade scope', () => {
    assert.equal(rowCanEdit({ grade: 'G2', permissions: { canEdit: false } }, { canEdit: true }), false);
    assert.equal(rowCanEdit({ grade: 'G2' }, { canEdit: false }), false);
    assert.equal(rowCanEdit({ grade: 'G2' }, { canEdit: true, canEditAllGrades: true }), true);
    assert.equal(rowCanEdit({ grade: 'G2' }, { canEdit: true, grades: ['G2'] }), true);
    assert.equal(rowCanEdit({ grade: 'G3' }, { canEdit: true, grades: ['G2'] }), false);
});

test('impact entries keep a fixed order and coerce missing counts to zero', () => {
    assert.deepEqual(impactEntries({ affectedStudents: 4, retestsOnArchivedWords: 2 }).slice(0, 2), [
        { key: 'affectedStudents', value: 4 },
        { key: 'changedPositions', value: 0 }
    ]);
    assert.equal(impactEntries({}).length, 6);
});
