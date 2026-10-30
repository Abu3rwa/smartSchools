import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTutorCsvTemplate, parseTutorCsv } from './tutorCsvImport.js';

test('the template imports as three lessons in two chapters of one unit', () => {
  const parsed = parseTutorCsv(buildTutorCsvTemplate());
  assert.equal(parsed.lessons.length, 3);
  assert.equal(parsed.units, 1);
  assert.deepEqual(parsed.lessons.map((lesson) => lesson.title), [
    'Solids keep their shape',
    'Gases fill the space',
    'Melting and freezing',
  ]);
  assert.deepEqual(parsed.lessons[0].standards, ['SCI.5.1', 'SCI.5.2']);
  assert.equal(parsed.lessons[2].chapterTitle, 'Changing state');
  assert.match(parsed.lessons[0].content, /particles are packed tightly/);
});

test('a lesson list without units or chapters is allowed', () => {
  const csv = 'lesson_number,lesson_title,content\n1,First lesson,Text one.\n2,Second lesson,Text two.\n';
  const parsed = parseTutorCsv(csv);
  assert.equal(parsed.lessons.length, 2);
  assert.equal(parsed.lessons[0].unitNumber, null);
  assert.equal(parsed.lessons[1].chapterNumber, null);
});

test('a chapter number without its title is rejected and names the row', () => {
  const csv = [
    'unit_number,unit_title,chapter_number,chapter_title,lesson_number,lesson_title,content',
    '1,Unit,1,Chapter,1,Good,T',
    '1,Unit,2,,2,Bad,T'
  ].join('\n');
  assert.throws(() => parseTutorCsv(csv), /Row 3: add chapter_title/);
});

test('the same lesson place twice rejects the file', () => {
  const csv = [
    'unit_number,unit_title,lesson_number,lesson_title,content',
    '1,Unit,1,One,A',
    '1,Unit,1,Two,B'
  ].join('\n');
  assert.throws(() => parseTutorCsv(csv), /Row 3: lesson 1 is already used/);
});

test('one unit cannot carry two different titles', () => {
  const csv = [
    'unit_number,unit_title,lesson_number,lesson_title,content',
    '1,Energy,1,One,A',
    '1,Enrgy,2,Two,B'
  ].join('\n');
  assert.throws(() => parseTutorCsv(csv), /unit 1 is called "Energy"/);
});

test('a missing content cell rejects the file', () => {
  const csv = 'lesson_number,lesson_title,content\n1,No text,\n';
  assert.throws(() => parseTutorCsv(csv), /Row 2: content is required/);
});

test('an unknown column is rejected instead of being ignored', () => {
  const csv = 'lesson_number,lesson_title,content,page\n1,One,A,4\n';
  assert.throws(() => parseTutorCsv(csv), /not part of the tutor template: page/);
});

test('a comma inside a value must be quoted', () => {
  const csv = 'lesson_number,lesson_title,content\n1,One,"Solids, liquids and gases."\n';
  const parsed = parseTutorCsv(csv);
  assert.equal(parsed.lessons[0].content, 'Solids, liquids and gases.');
});
