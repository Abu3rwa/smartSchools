import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildObjectivePayload,
    createObjectiveFields,
    getObjectiveDraftErrorKey
} from './questionPoolDefinitions.js';

test('expands an imported matching column into editable pairs', () => {
    const draft = createObjectiveFields({
        questionType: 'matching',
        matching_pairs: 'France::Paris|Kenya::Nairobi'
    });

    assert.deepEqual(draft.matchingPairs, [
        { left: 'France', right: 'Paris' },
        { left: 'Kenya', right: 'Nairobi' }
    ]);
    assert.equal(getObjectiveDraftErrorKey('matching', draft, ''), '');
    assert.deepEqual(buildObjectivePayload('matching', draft).matchingPairs, draft.matchingPairs);
});

test('expands an imported ordering column and leaves the ids to the server', () => {
    const draft = createObjectiveFields({ ordering_items: 'Evaporation>Condensation>Rain' });

    assert.deepEqual(draft.orderingItems.map((item) => item.text), ['Evaporation', 'Condensation', 'Rain']);
    assert.deepEqual(buildObjectivePayload('ordering', draft).orderingItems, draft.orderingItems);
});

test('keeps the stored ordering ids when a saved pool row is reopened', () => {
    const draft = createObjectiveFields({
        orderingItems: [
            { id: 'o1', text: 'Evaporation' },
            { id: 'o2', text: 'Condensation' },
            { id: 'o3', text: 'Rain' }
        ]
    });

    assert.deepEqual(buildObjectivePayload('ordering', draft).orderingItems.map((item) => item.id), ['o1', 'o2', 'o3']);
});

test('maps an imported blank_answers column onto the blanks in the question text', () => {
    const questionText = 'The {{b1}} floated on the {{b2}}.';
    const draft = createObjectiveFields({
        questionText,
        blank_answers: 'b1::leaf~leaves|b2::water~pond'
    });

    assert.deepEqual(buildObjectivePayload('fill_in_blank', { ...draft, questionText }).blanks, [
        { id: 'b1', accepts: ['leaf', 'leaves'] },
        { id: 'b2', accepts: ['water', 'pond'] }
    ]);
});

test('reads a positional blank_answers column by the order of the blanks', () => {
    const questionText = 'The {{b1}} floated on the {{b2}}.';
    const draft = createObjectiveFields({ questionText, blank_answers: 'leaf~leaves|water~pond' });

    assert.deepEqual(draft.blanks.map((blank) => blank.id), ['b1', 'b2']);
});

test('expands an imported numeric rule into the answer rule fields', () => {
    const draft = createObjectiveFields({ numeric_rule: 'tolerance::22~1|unit::cm|decimals::1' });

    assert.equal(draft.numericRule.mode, 'tolerance');
    assert.equal(draft.numericRule.value, '22');
    assert.equal(draft.numericRule.tolerance, '1');
    assert.equal(draft.numericRule.unit, 'cm');
    assert.equal(draft.numericRule.decimalPlaces, '1');
});

test('reads a range numeric rule into its minimum and maximum', () => {
    const draft = createObjectiveFields({ numeric_rule: 'range::10~20|unit::kg' });

    assert.equal(draft.numericRule.mode, 'range');
    assert.equal(draft.numericRule.min, '10');
    assert.equal(draft.numericRule.max, '20');
});

test('folds an imported multiple_select row back into its option key', () => {
    const draft = createObjectiveFields({
        questionType: 'multiple_select',
        options: [
            { label: 'A', text: 'Whale' },
            { label: 'B', text: 'Shark' },
            { label: 'C', text: 'Bat' },
            { label: 'D', text: 'Eagle' }
        ],
        correctAnswer: 'A|C'
    });

    assert.equal(getObjectiveDraftErrorKey('multiple_select', draft, ''), '');
    assert.equal(buildObjectivePayload('multiple_select', draft).correctAnswer, 'A|C');
});

test('refuses a draft that lost its definition instead of saving an ungradeable row', () => {
    const draft = createObjectiveFields({ questionType: 'matching', matching_pairs: 'France::Paris' });

    assert.equal(getObjectiveDraftErrorKey('matching', draft, ''), 'pairsFew');
});
