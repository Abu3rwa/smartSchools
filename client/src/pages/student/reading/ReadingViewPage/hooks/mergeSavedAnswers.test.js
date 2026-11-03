import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSavedAnswers } from './mergeSavedAnswers.js';

test('server answers fill keys the student has not touched', () => {
  assert.deepEqual(
    mergeSavedAnswers({}, { a: '1', b: '2' }),
    { a: '1', b: '2' },
  );
});

test('typed answers win, including answers the student cleared', () => {
  assert.deepEqual(
    mergeSavedAnswers({ a: 'mine', b: '' }, { a: 'server', b: 'server', c: 'new' }),
    { a: 'mine', b: '', c: 'new' },
  );
});

test('missing input never throws', () => {
  assert.deepEqual(mergeSavedAnswers(null, null), {});
});
