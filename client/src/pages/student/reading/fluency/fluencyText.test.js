import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deltaSinceFirst,
  goalDots,
  markedTokens,
  referenceTokens,
  signedDelta,
  smoothnessStars,
  sparklinePoints,
} from './fluencyText.js';

test('referenceTokens keeps years and em dashes in one unit', () => {
  const words = referenceTokens("In 1770, colonists' cargo—tea was gone.").map((token) => token.word);
  assert.deepEqual(words, ['In', '1770', 'colonists', 'cargo—tea', 'was', 'gone']);
});

test('markedTokens lines statusMap up with the reference words', () => {
  const tokens = markedTokens('Before long, the crowd fired.', 'ccesc');
  assert.deepEqual(tokens.map((token) => token.status), ['c', 'c', 'e', 's', 'c']);
  assert.equal(tokens[4].word, 'fired');
});

test('unread trailing words stay plain', () => {
  const tokens = markedTokens('one two three', 'cc');
  assert.deepEqual(tokens.map((token) => token.status), ['c', 'c', 'u']);
});

test('goalDots fills counted readings only', () => {
  assert.deepEqual(goalDots(2, 3), [true, true, false]);
  assert.deepEqual(goalDots(5, 3), [true, true, true]);
  assert.deepEqual(goalDots(0, 0), []);
});

test('deltaSinceFirst uses the first reading as the baseline', () => {
  assert.equal(deltaSinceFirst(94, 88), 6);
  assert.equal(deltaSinceFirst(80, 90), -10);
  assert.equal(deltaSinceFirst(null, 90), null);
});

test('signedDelta adds a plus only when it goes up', () => {
  assert.equal(signedDelta(6), '+6');
  assert.equal(signedDelta(-4), '-4');
  assert.equal(signedDelta(0), '0');
});

test('smoothnessStars maps one to three stars', () => {
  assert.deepEqual(smoothnessStars(3), [true, true, true]);
  assert.deepEqual(smoothnessStars(2), [true, true, false]);
  assert.deepEqual(smoothnessStars(0), [false, false, false]);
});

test('sparkline needs two points and stays inside the box', () => {
  assert.equal(sparklinePoints([90]), '');
  const points = sparklinePoints([90, 100], 100, 20, 2).split(' ').map((pair) => pair.split(',').map(Number));
  assert.equal(points.length, 2);
  assert.ok(points.every(([x, y]) => x >= 2 && x <= 98 && y >= 2 && y <= 18));
});
