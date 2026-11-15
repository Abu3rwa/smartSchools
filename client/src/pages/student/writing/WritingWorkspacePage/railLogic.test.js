import assert from 'node:assert/strict';
import test from 'node:test';
import { usedWordSet, wordIsUsed, wordMatches } from './railLogic.js';

test('search matches the word, base form, meaning, and Arabic gloss', () => {
  const row = {
    word: 'photosynthesis',
    baseWord: 'photosynthesize',
    meaning: 'how plants make food',
    arabicMeaning: 'البناء الضوئي',
  };
  assert.equal(wordMatches(row, 'photo'), true);
  assert.equal(wordMatches(row, 'plant'), true);
  assert.equal(wordMatches(row, 'البناء'), true);
  assert.equal(wordMatches(row, 'synthesize'), true);
  assert.equal(wordMatches(row, 'gravity'), false);
  assert.equal(wordMatches(row, '  '), true);
  assert.equal(wordMatches('because', 'cau'), true);
  assert.equal(wordMatches('because', 'gravity'), false);
});

test('the tick uses the same forms the server counts', () => {
  const used = new Set(['beautiful', 'ran']);
  assert.equal(wordIsUsed({ word: 'beautiful' }, used), true);
  assert.equal(wordIsUsed({ word: 'Beautiful' }, used), true);
  assert.equal(wordIsUsed({ word: 'beauty', forms: ['beautiful'] }, used), true);
  assert.equal(wordIsUsed({ word: 'run', baseWord: 'ran' }, used), true);
  assert.equal(wordIsUsed({ word: 'run', forms: ['running'] }, used), false);
  assert.equal(wordIsUsed({ word: 'run' }, ['run']), true);
  assert.equal(wordIsUsed(null, used), false);
});

test('an Arabic draft ticks the Arabic word-bank rows it used', () => {
  const used = usedWordSet([
    { text: 'أعتقد أن الزي المدرسي عادل.' },
    { text: '' },
    { text: 'لكن الطابور  طويل' },
  ]);
  assert.equal(used.has('الزي'), true);
  assert.equal(used.has('طويل'), true);
  assert.equal(used.has('عدل'), false);
  assert.equal(wordIsUsed({ word: 'الزي' }, used), true);
  assert.equal(wordIsUsed({ word: 'طويل' }, used), true);
  assert.equal(wordIsUsed({ word: 'قصير' }, used), false);
});

test('a draft with no text ticks nothing', () => {
  assert.equal(usedWordSet([]).size, 0);
  assert.equal(usedWordSet([{ text: '   ' }]).size, 0);
  assert.equal(usedWordSet(null).size, 0);
});
