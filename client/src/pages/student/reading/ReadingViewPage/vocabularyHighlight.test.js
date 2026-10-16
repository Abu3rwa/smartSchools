import assert from 'node:assert/strict';
import test from 'node:test';
import { findVocabularyMatches } from './vocabularyHighlight.js';

test('finds original and simplified vocabulary terms case-insensitively', () => {
  const vocabulary = [{ original: 'drooping', simple: 'hanging down', definition: 'bending down' }];
  const text = 'The plant was DROOPING. Its leaves were hanging   down.';

  assert.deepEqual(
    findVocabularyMatches(text, vocabulary).map(({ term, vocabulary: item }) => [term, item.definition]),
    [
      ['DROOPING', 'bending down'],
      ['hanging   down', 'bending down'],
    ],
  );
});

test('matches phrases at word boundaries and preserves punctuation outside matches', () => {
  const text = 'They run the store, but visit a store; the storehouse is closed.';
  const matches = findVocabularyMatches(text, [
    { original: 'run the store', definition: 'manage a shop' },
    { original: 'store', definition: 'a shop' },
  ]);

  assert.deepEqual(matches.map(({ start, end, term }) => [text.slice(start, end), term]), [
    ['run the store', 'run the store'],
    ['store', 'store'],
  ]);
});

test('returns no matches when vocabulary is missing or only embedded in another word', () => {
  assert.deepEqual(findVocabularyMatches('The storehouse is closed.', [
    { original: 'store', definition: 'a shop' },
  ]), []);
  assert.deepEqual(findVocabularyMatches('Passage text.', []), []);
});

test('keeps app vocabulary meaning and pronunciation audio on the highlighted word', () => {
  const appVocabularyEntry = {
    original: 'garden',
    definition: 'a place where plants grow',
    meaning: 'a place where plants grow',
    audio: { dictionaries: { oxford: { us: 'https://audio.example/garden.mp3' } } },
  };
  const [match] = findVocabularyMatches('Maya visited the garden.', [appVocabularyEntry]);

  assert.equal(match.vocabulary, appVocabularyEntry);
  assert.equal(match.vocabulary.meaning, 'a place where plants grow');
  assert.equal(match.vocabulary.audio.dictionaries.oxford.us, 'https://audio.example/garden.mp3');
});
