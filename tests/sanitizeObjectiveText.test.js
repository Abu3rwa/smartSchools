import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeObjectiveText, isObjectiveTextDegenerate } from '../utils/sanitizeObjectiveText.js';

test('sanitizeObjectiveText strips At Risk marker', () => {
    const value = sanitizeObjectiveText('Understand fractions\nAt Risk');
    assert.equal(value, 'Understand fractions');
});

test('sanitizeObjectiveText strips score telemetry', () => {
    const value = sanitizeObjectiveText('Solve equations Score: 34%');
    assert.equal(value, 'Solve equations');
});

test('sanitizeObjectiveText strips combined noise tokens', () => {
    const value = sanitizeObjectiveText('At Risk\nScore: 30%\nDeveloping');
    assert.equal(value, '');
    assert.equal(isObjectiveTextDegenerate(value), true);
});

test('sanitizeObjectiveText keeps clean objective text', () => {
    const value = sanitizeObjectiveText('Identify properties of triangles');
    assert.equal(value, 'Identify properties of triangles');
});

test('sanitizeObjectiveText strips mastery labels and parenthesized percentages', () => {
    assert.equal(
        sanitizeObjectiveText('Apply proportional reasoning Mastered'),
        'Apply proportional reasoning'
    );
    assert.equal(sanitizeObjectiveText('Decimals (72%)'), 'Decimals');
});

test('isObjectiveTextDegenerate returns false for useful objective text', () => {
    const text = sanitizeObjectiveText('Solve and graph one-variable linear equations using inverse operations.');
    assert.equal(isObjectiveTextDegenerate(text), false);
});
