import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    buildImportPlan,
    importPlanHasChanges,
    summarizeImportPlan
} from '../services/spellingLibraryService.js';

const word = (overrides = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    grade: 'G2',
    week: 1,
    category: 'Review',
    word: 'red fox',
    normalizedWord: 'red fox',
    definition: 'A wild animal',
    order: 1,
    revision: 3,
    deletedAt: null,
    ...overrides
});

const row = (overrides = {}) => ({
    rowNumber: 2,
    grade: 'G2',
    week: 1,
    category: 'Review',
    word: 'red fox',
    normalizedWord: 'red fox',
    definition: 'A wild animal',
    order: 1,
    ...overrides
});

test('a file identical to the library plans no changes and no version bump is needed', () => {
    const fox = word();
    const plan = buildImportPlan({ wordLists: [fox], rows: [row()] });

    assert.equal(importPlanHasChanges(plan), false);
    assert.deepEqual(
        summarizeImportPlan({ plan, wordLists: [fox], mode: 'merge' }),
        {
            planned: { added: 0, updated: 0, removed: 0, reusedArchived: 0 },
            replaceScope: null
        }
    );
});

test('definition-only and category-only edits count as updates', () => {
    const fox = word();
    const definitionPlan = buildImportPlan({
        wordLists: [fox],
        rows: [row({ definition: 'A wild canine' })]
    });
    assert.equal(importPlanHasChanges(definitionPlan), true);
    assert.equal(summarizeImportPlan({ plan: definitionPlan, wordLists: [fox] }).planned.updated, 1);

    const categoryPlan = buildImportPlan({
        wordLists: [fox],
        rows: [row({ category: 'Animals' })]
    });
    assert.equal(importPlanHasChanges(categoryPlan), true);
    assert.equal(summarizeImportPlan({ plan: categoryPlan, wordLists: [fox] }).planned.updated, 1);
});

test('merge adds new words without touching other weeks', () => {
    const fox = word();
    const wolf = word({ word: 'wolf', normalizedWord: 'wolf', week: 2, order: 1, revision: 1 });
    const plan = buildImportPlan({
        wordLists: [fox, wolf],
        rows: [
            row(),
            row({
                rowNumber: 3,
                week: 2,
                order: 2,
                word: 'bear',
                normalizedWord: 'bear',
                definition: 'A large animal'
            })
        ]
    });

    const summary = summarizeImportPlan({ plan, wordLists: [fox, wolf], mode: 'merge' });
    assert.deepEqual(summary.planned, { added: 1, updated: 0, removed: 0, reusedArchived: 0 });
    assert.equal(summary.replaceScope, null);
});

test('replace reports the full grade scope, not only the weeks in the file', () => {
    const fox = word();
    const wolf = word({ word: 'wolf', normalizedWord: 'wolf', order: 2, revision: 1 });
    const bear = word({ word: 'bear', normalizedWord: 'bear', week: 2, order: 1, revision: 1 });
    const plan = buildImportPlan({
        wordLists: [fox, wolf, bear],
        rows: [row()],
        mode: 'replace'
    });

    const summary = summarizeImportPlan({ plan, wordLists: [fox, wolf, bear], mode: 'replace' });
    assert.deepEqual(summary.replaceScope, [{
        grade: 'G2',
        currentWords: 3,
        kept: 1,
        removed: 2,
        added: 0
    }]);
    assert.deepEqual(summary.planned, { added: 0, updated: 0, removed: 2, reusedArchived: 0 });
});

test('an ambiguous replace match fails closed on commit and lists candidates on preview', () => {
    const first = word({ deletedAt: new Date('2026-01-01'), revision: 5 });
    const second = word({ deletedAt: new Date('2026-02-01'), revision: 6 });

    assert.throws(
        () => buildImportPlan({ wordLists: [first, second], rows: [row()], mode: 'replace' }),
        (error) => error.code === 'IDENTITY_AMBIGUOUS'
            && error.details.some((detail) => detail.row === 2)
    );

    const plan = buildImportPlan({
        wordLists: [first, second],
        rows: [row()],
        mode: 'replace',
        collectAmbiguities: true
    });
    assert.equal(plan.ambiguities.length, 1);
    assert.equal(plan.ambiguities[0].row, 2);
    assert.deepEqual(
        plan.ambiguities[0].candidates.map((candidate) => candidate.wordId),
        [String(first._id), String(second._id)]
    );
    assert.equal(plan.ambiguities[0].candidates[0].archived, true);
    assert.equal(plan.ambiguities[0].candidates[1].revision, 6);
});

test('an explicit mapping resolves the ambiguity and counts as a restored word', () => {
    const first = word({ deletedAt: new Date('2026-01-01'), revision: 5 });
    const second = word({ deletedAt: new Date('2026-02-01'), revision: 6 });
    const plan = buildImportPlan({
        wordLists: [first, second],
        rows: [row()],
        mode: 'replace',
        mappings: [{ rowNumber: 2, wordId: String(first._id), expectedRevision: 5 }]
    });

    assert.equal(plan.ambiguities.length, 0);
    assert.equal(importPlanHasChanges(plan), true);
    const summary = summarizeImportPlan({ plan, wordLists: [first, second], mode: 'replace' });
    assert.deepEqual(summary.planned, { added: 1, updated: 0, removed: 0, reusedArchived: 1 });
    assert.deepEqual(summary.replaceScope, [{
        grade: 'G2',
        currentWords: 0,
        kept: 0,
        removed: 0,
        added: 1
    }]);
});

test('a stale mapping revision is rejected before any write', () => {
    const first = word({ deletedAt: new Date('2026-01-01'), revision: 5 });
    const second = word({ deletedAt: new Date('2026-02-01'), revision: 6 });

    assert.throws(
        () => buildImportPlan({
            wordLists: [first, second],
            rows: [row()],
            mode: 'replace',
            mappings: [{ rowNumber: 2, wordId: String(first._id), expectedRevision: 4 }]
        }),
        (error) => error.code === 'STALE_REVISION'
    );
});
