import assert from 'node:assert/strict';
import test from 'node:test';
import { spreadStart, visiblePageIndexes } from './bookSpread.js';

test('a spread starts on the even page that owns the index', () => {
  assert.equal(spreadStart(0, true), 0);
  assert.equal(spreadStart(1, true), 0);
  assert.equal(spreadStart(2, true), 2);
  assert.equal(spreadStart(7, true), 6);
  assert.equal(spreadStart(7, false), 7);
});

test('a spread shows both pages of the pair', () => {
  assert.deepEqual(visiblePageIndexes(3, true, 10), [2, 3]);
  assert.deepEqual(visiblePageIndexes(2, true, 10), [2, 3]);
  assert.deepEqual(visiblePageIndexes(0, true, 1), [0]);
});

test('the right slot goes blank on an odd page count', () => {
  assert.deepEqual(visiblePageIndexes(4, true, 5), [4]);
  assert.deepEqual(visiblePageIndexes(6, true, 5), []);
});

test('single mode shows exactly one page', () => {
  assert.deepEqual(visiblePageIndexes(0, false, 9), [0]);
  assert.deepEqual(visiblePageIndexes(8, false, 9), [8]);
  assert.deepEqual(visiblePageIndexes(9, false, 9), []);
});
