import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepairPlan } from '../scripts/repairSpellingDanglingWords.js';

const MISSING_ID = '6ac5404a9d4490722d9c2470';

const reference = (overrides = {}) => ({
    wordId: MISSING_ID,
    student: 'student-a',
    source: 'attempt',
    word: 'Halloween',
    week: 8,
    category: 'Holidays',
    ...overrides
});

const existingWord = (overrides = {}) => ({
    _id: '6ac5404a9d4490722d9c2471',
    week: 8,
    order: 12,
    ...overrides
});

test('a missing identity referenced by attempts becomes an archived tombstone', () => {
    const plan = buildRepairPlan({
        grade: 'G4',
        words: [existingWord()],
        references: [reference(), reference({ source: 'retest-item', student: 'student-b' })]
    });

    assert.equal(plan.conflicts.length, 0);
    assert.equal(plan.tombstones.length, 1);
    const [tombstone] = plan.tombstones;
    assert.equal(tombstone.wordId, MISSING_ID);
    assert.equal(tombstone.word, 'Halloween');
    assert.equal(tombstone.normalizedWord, 'halloween');
    assert.equal(tombstone.week, 8);
    assert.equal(tombstone.category, 'Holidays');
    assert.equal(tombstone.references, 2);
    assert.equal(tombstone.students, 2);
    assert.equal(tombstone.order, 13, 'the tombstone takes the next free position');
});

test('references to identities that still exist need no tombstone', () => {
    const plan = buildRepairPlan({
        grade: 'G4',
        words: [existingWord()],
        references: [reference({ wordId: '6ac5404a9d4490722d9c2471' })]
    });

    assert.deepEqual(plan.tombstones, []);
    assert.deepEqual(plan.conflicts, []);
});

test('conflicting recorded evidence blocks the identity instead of guessing', () => {
    const plan = buildRepairPlan({
        grade: 'G4',
        words: [],
        references: [
            reference(),
            reference({ word: 'Hanukkah' })
        ]
    });

    assert.deepEqual(plan.tombstones, []);
    assert.equal(plan.conflicts.length, 1);
    assert.equal(plan.conflicts[0].wordId, MISSING_ID);
    assert.deepEqual(plan.conflicts[0].reasons, ['conflicting text, week or category']);
});

test('a different recorded week is conflicting evidence', () => {
    const plan = buildRepairPlan({
        grade: 'G4',
        words: [],
        references: [reference(), reference({ week: 9 })]
    });

    assert.deepEqual(plan.tombstones, []);
    assert.equal(plan.conflicts.length, 1);
});

test('missing text, an out-of-grade week or a missing category blocks the identity', () => {
    const cases = [
        ['', 8, 'Holidays', 'no recorded word text'],
        ['Halloween', 99, 'Holidays', 'recorded week is outside this grade'],
        ['Halloween', 8, '  ', 'no recorded category']
    ];

    for (const [word, week, category, reason] of cases) {
        const plan = buildRepairPlan({
            grade: 'G4',
            words: [],
            references: [reference({ word, week, category })]
        });
        assert.deepEqual(plan.tombstones, [], `no tombstone for ${reason}`);
        assert.deepEqual(plan.conflicts[0].reasons, [reason]);
    }
});

test('each tombstone in one week takes a distinct position', () => {
    const plan = buildRepairPlan({
        grade: 'G4',
        words: [existingWord({ order: 10 })],
        references: [
            reference(),
            reference({ wordId: '6ac5404a9d4490722d9c2478', word: 'Hanukkah' }),
            reference({ wordId: '6ac5404a9d4490722d9c2479', word: 'Cinco de Mayo' })
        ]
    });

    assert.equal(plan.conflicts.length, 0);
    assert.deepEqual(plan.tombstones.map((tombstone) => tombstone.order), [11, 12, 13]);
});
