import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkForSpeech, speechLang } from './readAloud.js';

test('splits a passage at sentence boundaries', () => {
  assert.deepEqual(chunkForSpeech('Mina found a bird. She carried it home.'), [
    'Mina found a bird.',
    'She carried it home.',
  ]);
});

test('keeps Arabic question marks as sentence ends', () => {
  assert.deepEqual(chunkForSpeech('هل أحضرت العصا؟ نعم، أحضرتها.'), [
    'هل أحضرت العصا؟',
    'نعم، أحضرتها.',
  ]);
});

test('splits a sentence that is too long for one utterance', () => {
  const long = `The quick brown fox ${'jumps '.repeat(60)}over the lazy dog.`;
  const chunks = chunkForSpeech(long);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 200));
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), long.replace(/\s+/g, ' ').trim());
});

test('collapses line breaks into one spoken flow', () => {
  assert.deepEqual(chunkForSpeech('  First line.\n\n    Second line.  '), [
    'First line.',
    'Second line.',
  ]);
});

test('empty text speaks nothing', () => {
  assert.deepEqual(chunkForSpeech('   \n '), []);
});

test('language codes map to speech tags', () => {
  assert.equal(speechLang('ar'), 'ar-SA');
  assert.equal(speechLang('en'), 'en-US');
  assert.equal(speechLang(undefined), 'en-US');
  assert.equal(speechLang('fr'), 'fr');
});
