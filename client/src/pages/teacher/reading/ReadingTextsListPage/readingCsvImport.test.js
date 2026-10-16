import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReadingCsvTemplate, parseReadingCsv } from './readingCsvImport.js';

test('template round-trips multiline text and optional MCQ, true/false, and short answer questions', () => {
  const reading = parseReadingCsv(buildReadingCsvTemplate());
  assert.equal(reading.title, 'The Brave Little Bird');
  assert.equal(reading.originalText, 'Mina found a small bird under a tree.\n\nShe gently carried it to the animal shelter.');
  assert.deepEqual(reading.sections, [
    { order: 1, title: 'A Small Discovery', text: 'Mina found a small bird under a tree.' },
    { order: 2, title: 'A Kind Choice', text: 'She gently carried it to the animal shelter.' },
  ]);
  assert.deepEqual(reading.questions.map(({ type }) => type), [
    'multiple_choice',
    'true_false',
    'short_answer',
  ]);
  assert.equal(reading.questions[0].correctIndex, 0);
  assert.equal(reading.questions[1].correctAnswer, true);
  assert.equal(reading.questions[2].prompt, 'Use a detail from the story.');
  assert.deepEqual(reading.vocabularySubstitutions, [
    { original: 'shelter', simple: 'safe place', definition: 'a place that cares for animals' },
    { original: 'gently', simple: 'softly', definition: 'in a careful and kind way' },
  ]);
});

test('reading CSV can omit all questions and preserves paragraph indentation', () => {
  const csv = 'title,original_text\n"My essay","  Opening line.\n\n    Indented paragraph."';
  const reading = parseReadingCsv(csv);
  assert.equal(reading.questions.length, 0);
  assert.equal(reading.originalText, '  Opening line.\n\n    Indented paragraph.');
  assert.deepEqual(reading.vocabularySubstitutions, []);
  assert.deepEqual(reading.sections, []);
});

test('section CSV preserves formatting and ignores legacy audio_url values', () => {
  const obsoleteAudioUrl = 'not-a-valid-audio-url';
  const csv = [
    'title,section_order,section_title,section_text,audio_url',
    `Story,1,Opening,"  First paragraph.\n\n    Indented line.",${obsoleteAudioUrl}`,
    ',2,Ending,The end.,',
  ].join('\n');
  const reading = parseReadingCsv(csv);
  assert.equal(reading.originalText, '  First paragraph.\n\n    Indented line.\n\nThe end.');
  assert.equal(reading.sections[0].audioUrl, undefined);
  assert.equal(reading.sections[1].order, 2);
});

test('section CSV rejects gaps', () => {
  const header = 'title,section_order,section_text,audio_url\n';
  assert.throws(() => parseReadingCsv(`${header}Story,2,Section,`), /start at 1 and have no gaps/);
});

test('CSV accepts phrase vocabulary on different rows and merges unique entries', () => {
  const csv = [
    'title,section_order,section_text,vocabulary_words,vocabulary_simplifications,vocabulary_definitions',
    'Story,1,"The team run the store each morning.","run the store","manage the shop","to be responsible for a shop"',
    ',2,"The team opens early.",team,,a group working together',
  ].join('\n');
  const reading = parseReadingCsv(csv);
  assert.deepEqual(reading.vocabularySubstitutions, [
    { original: 'run the store', simple: 'manage the shop', definition: 'to be responsible for a shop' },
    { original: 'team', simple: '', definition: 'a group working together' },
  ]);
});

test('CSV rejects vocabulary terms embedded only inside another word', () => {
  const csv = 'title,original_text,vocabulary_words,vocabulary_definitions\nStory,They opened the store.,he,a person';
  assert.throws(() => parseReadingCsv(csv), /was not found in the passage/);
});

test('CSV rejects vocabulary words that are not found in the passage', () => {
  const csv = [
    'title,original_text,vocabulary_words,vocabulary_definitions',
    'Essay,"A short passage.",missing,"A definition"',
  ].join('\n');
  assert.throws(() => parseReadingCsv(csv), /was not found in the passage/);
});

test('CSV rejects a correct answer that does not match an MCQ option', () => {
  const csv = [
    'title,original_text,question_type,question,options,correct_answer',
    'Essay,Passage,mcq,Question?,First|Second,Third',
  ].join('\n');
  assert.throws(() => parseReadingCsv(csv), /correct_answer must exactly match/);
});

test('CSV rejects inconsistent repeated lesson details', () => {
  const csv = [
    'title,original_text,question_type,question',
    'Essay,Passage,mcq,First?',
    'Different title,,true_false,Second?',
  ].join('\n');
  assert.throws(() => parseReadingCsv(csv), /different title/);
});

test('CSV rejects unclosed quotes', () => {
  assert.throws(() => parseReadingCsv('title,original_text\nEssay,"passage'), /unclosed quoted value/);
});
