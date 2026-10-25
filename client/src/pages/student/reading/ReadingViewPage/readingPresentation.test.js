import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReadingLevels,
  findLevelIndex,
  mergeVocabulary,
  readingBlocksFor,
} from './readingPresentation.js';

test('a levelled reading shows the simplified passage, not the original', () => {
  const levels = buildReadingLevels({
    targetLevel: 8,
    simplifiedContent: 'Mina found a bird.',
    text: {
      originalText: 'Mina discovered a small avian specimen beneath the arboreal canopy.',
      sections: [{ order: 1, title: 'Opening', text: 'Mina discovered a small avian specimen.' }],
    },
    readingLevels: [
      { targetLevel: 6, text: 'Mina saw a bird.' },
      { targetLevel: 8, text: 'Mina found a bird.' },
    ],
  });
  assert.deepEqual(levels.map((level) => level.targetLevel), [6, 8]);
  assert.equal(levels[findLevelIndex(levels, 8)].text, 'Mina found a bird.');
  assert.equal(readingBlocksFor(levels[1])[0].text, 'Mina found a bird.');
});

test('an unlevelled reading keeps the teacher sections and their titles', () => {
  const levels = buildReadingLevels({
    targetLevel: 9,
    simplifiedContent: 'First.\n\nSecond.',
    text: {
      originalText: 'First.\n\nSecond.',
      sections: [
        { order: 2, title: 'End', text: 'Second.' },
        { order: 1, title: 'Start', text: 'First.' },
      ],
    },
    readingLevels: [
      {
        targetLevel: 9,
        text: 'First.\n\nSecond.',
        sections: [
          { order: 1, title: 'Start', text: 'First.' },
          { order: 2, title: 'End', text: 'Second.' },
        ],
      },
    ],
  });
  const blocks = readingBlocksFor(levels[0]);
  assert.deepEqual(blocks.map((block) => block.title), ['Start', 'End']);
  assert.equal(levels[0].sections[0].order, 1);
});

test('a payload without reading levels still falls back to the served text', () => {
  const levels = buildReadingLevels({
    targetLevel: 7,
    simplifiedContent: 'Simplified body.',
    text: { originalText: 'Original body.', sections: [] },
  });
  assert.equal(levels.length, 1);
  assert.equal(levels[0].text, 'Simplified body.');
  assert.equal(readingBlocksFor(levels[0])[0].text, 'Simplified body.');
});

test('level switching keeps lesson vocabulary and prefers the audio-enriched record', () => {
  const merged = mergeVocabulary(
    [{ original: 'shelter', simple: 'safe place', definition: 'a place that cares for animals', audio: { dictionaries: { oxford: { us: 'https://x/1.mp3' } } } }],
    [{ original: 'shelter', simple: 'safe place', definition: 'a place that cares for animals' }, { original: 'brave', simple: '', definition: 'showing courage' }]
  );
  assert.deepEqual(merged.map((item) => item.original).sort(), ['brave', 'shelter']);
  const shelter = merged.find((item) => item.original === 'shelter');
  assert.ok(shelter.audio);
  assert.equal('priority' in shelter, false);
});

test('unknown recommended levels default to the first one', () => {
  const levels = [{ targetLevel: 6 }, { targetLevel: 8 }];
  assert.equal(findLevelIndex(levels, 99), 0);
  assert.equal(findLevelIndex(levels, 8), 1);
});
