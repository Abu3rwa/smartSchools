import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveQuestionState } from './questionState.js';

test('a ready chapter is open', () => {
  assert.deepEqual(deriveQuestionState({}), { state: 'ready', reason: null });
});

test('the gate locks questions first', () => {
  assert.deepEqual(
    deriveQuestionState({ gateEnabled: true, completed: true }),
    { state: 'submitted', reason: null },
  );
  assert.deepEqual(
    deriveQuestionState({ gateEnabled: true, closedCode: 'READING_NOT_PUBLISHED' }),
    { state: 'locked', reason: 'reading_gate' },
  );
});

test('a submitted chapter stays submitted', () => {
  assert.deepEqual(
    deriveQuestionState({ completed: true }),
    { state: 'submitted', reason: null },
  );
});

test('a closed reading explains itself', () => {
  assert.deepEqual(
    deriveQuestionState({ closedCode: 'READING_NOT_PUBLISHED' }),
    { state: 'closed', reason: 'READING_NOT_PUBLISHED' },
  );
  assert.equal(
    deriveQuestionState({ closedCode: 'READING_ASSIGNMENT_NOT_FOUND' }).state,
    'closed',
  );
  assert.equal(deriveQuestionState({ closedCode: 'SOMETHING_ELSE' }).state, 'ready');
});
