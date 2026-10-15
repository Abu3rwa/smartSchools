import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReadingCsvTemplate, parseReadingCsv } from './readingCsvImport.js';

test('template round-trips multiline text and optional MCQ, true/false, and short answer questions', () => {
  const reading = parseReadingCsv(buildReadingCsvTemplate());
  assert.equal(reading.title, 'The Brave Little Bird');
  assert.equal(reading.originalText, 'Mina found a small bird under a tree.\n\nShe gently carried it to the animal shelter.');
  assert.deepEqual(reading.questions.map(({ type }) => type), [
    'multiple_choice',
    'true_false',
    'short_answer',
  ]);
  assert.equal(reading.questions[0].correctIndex, 0);
  assert.equal(reading.questions[1].correctAnswer, true);
  assert.equal(reading.questions[2].prompt, 'Use a detail from the story.');
});

test('reading CSV can omit all questions and preserves paragraph indentation', () => {
  const csv = 'title,original_text\n"My essay","  Opening line.\n\n    Indented paragraph."';
  const reading = parseReadingCsv(csv);
  assert.equal(reading.questions.length, 0);
  assert.equal(reading.originalText, '  Opening line.\n\n    Indented paragraph.');
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
