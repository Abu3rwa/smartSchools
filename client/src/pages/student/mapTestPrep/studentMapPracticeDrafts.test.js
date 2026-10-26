import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearMapPracticeDrafts,
  getMapPracticeDraftKey,
  mergeMapPracticeDrafts,
  readMapPracticeDrafts,
  writeMapPracticeDrafts,
} from './studentMapPracticeDrafts.js';

const createStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
    store,
  };
};

test('draft keys are scoped to the attempt', () => {
  assert.equal(getMapPracticeDraftKey('abc'), 'mapPracticeDraft:abc');
});

test('drafts round-trip through storage', () => {
  const storage = createStorage();
  writeMapPracticeDrafts('attempt-1', { q1: 'A', q2: ['B', 'C'] }, storage);

  assert.deepEqual(readMapPracticeDrafts('attempt-1', storage), { q1: 'A', q2: ['B', 'C'] });
});

test('empty answers are never stored', () => {
  const storage = createStorage();
  writeMapPracticeDrafts('attempt-1', { q1: '   ', q2: [] }, storage);

  assert.deepEqual(readMapPracticeDrafts('attempt-1', storage), {});
});

test('clearing removes the attempt key only', () => {
  const storage = createStorage();
  writeMapPracticeDrafts('attempt-1', { q1: 'A' }, storage);
  writeMapPracticeDrafts('attempt-2', { q1: 'B' }, storage);

  clearMapPracticeDrafts('attempt-1', storage);

  assert.deepEqual(readMapPracticeDrafts('attempt-1', storage), {});
  assert.deepEqual(readMapPracticeDrafts('attempt-2', storage), { q1: 'B' });
});

test('corrupt draft payloads are ignored', () => {
  const storage = createStorage();
  storage.setItem(getMapPracticeDraftKey('attempt-1'), '{not json');

  assert.deepEqual(readMapPracticeDrafts('attempt-1', storage), {});
});

test('drafts override server answers for questions in the set', () => {
  const merged = mergeMapPracticeDrafts(
    { q1: 'A', q2: 'B' },
    { q2: 'C', q3: 'D', stale: 'X' },
    ['q1', 'q2', 'q3']
  );

  assert.deepEqual(merged, { q1: 'A', q2: 'C', q3: 'D' });
});
