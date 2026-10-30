import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WRITING_CSV_HEADERS,
  buildWritingCsvTemplate,
  formPatchFromCsv,
  parseWritingCsv,
} from './writingCsvImport.js';
import { toCsv } from '../../../../utils/csvCells.js';

/** One CSV from row objects, using the template's own column order. */
const csv = (rows) => toCsv([WRITING_CSV_HEADERS,
  ...rows.map((row) => WRITING_CSV_HEADERS.map((header) => row[header] ?? ''))]);

const sectionRow = (extra = {}) => ({
  title: 'Retell a myth',
  writing_type: 'story',
  section_order: '1',
  section_name: 'Beginning',
  section_kind: 'opening',
  section_required: 'yes',
  rubric_order: '1',
  rubric_label: 'Ideas',
  rubric_max_score: '4',
  ...extra,
});

test('the template file the teacher downloads parses back', () => {
  const parsed = parseWritingCsv(buildWritingCsvTemplate());
  assert.equal(parsed.title, 'Opinion essay: school uniforms');
  assert.equal(parsed.writingType, 'essay');
  assert.equal(parsed.dueDate, '2026-11-12');
  assert.equal(parsed.minWords, 120);
  assert.equal(parsed.maxWords, 250);
  assert.deepEqual(parsed.sections.map((row) => row.key), ['introduction', 'body_paragraph', 'conclusion']);
  assert.deepEqual(
    { min: parsed.sections[1].minCount, max: parsed.sections[1].maxCount, repeatable: parsed.sections[1].repeatable },
    { min: 2, max: 3, repeatable: true },
  );
  assert.deepEqual(parsed.sections[0].criteria, ['Clear point of view', 'Sets up the essay']);
  assert.deepEqual(parsed.rubric.map((row) => row.maxScore), [5, 5, 4]);
  assert.deepEqual(parsed.rubric[2].appliesToSections, ['introduction', 'conclusion']);
  assert.deepEqual(parsed.rubric[0].appliesToSections, ['*']);
  assert.equal(parsed.workflow.teacherPublishesFeedback, true);
  assert.equal(parsed.supports.wordBank.length, 3);
});

test('an unnamed kind still gives the task a plan, and blanks mean defaults', () => {
  const parsed = parseWritingCsv(csv([sectionRow({ writing_type: '' })]));
  assert.equal(parsed.writingType, 'essay');
  assert.equal(parsed.sections[0].kind, 'opening');
  assert.equal(parsed.sections[0].minWords, 0);
  assert.equal(parsed.sections[0].maxCount, 1);
  assert.equal(parsed.workflow.requireNotebookCheck, true);
  assert.equal(parsed.instructions, '');
});

test('a long quoted instruction keeps its line breaks', () => {
  const parsed = parseWritingCsv(csv([sectionRow({ instructions: 'Line one\nline two' })]));
  assert.equal(parsed.instructions, 'Line one\nline two');
});

test('a column this import does not read is refused rather than ignored', () => {
  const rows = csv([sectionRow()]).split('\r\n');
  rows[0] = `${rows[0]},marks_out`;
  rows[1] = `${rows[1]},20`;
  assert.throws(() => parseWritingCsv(rows.join('\r\n')), /marks_out/);
});

test('an older file with a max_drafts column is refused with the reason and the fix', () => {
  const rows = csv([sectionRow()]).split('\r\n');
  rows[0] = `${rows[0]},max_drafts`;
  rows[1] = `${rows[1]},4`;
  assert.throws(
    () => parseWritingCsv(rows.join('\r\n')),
    /max_drafts column, which is no longer used.*Delete that column/,
  );
});

test('a second row cannot quietly change the task', () => {
  assert.throws(
    () => parseWritingCsv(csv([
      sectionRow(),
      sectionRow({ title: 'A different task', section_order: '2', section_name: 'Middle', rubric_order: '2', rubric_label: 'Organisation' }),
    ])),
    /Row 3: title is different from the titled row/,
  );
});

test('sections must be numbered from one without gaps', () => {
  assert.throws(
    () => parseWritingCsv(csv([
      sectionRow(),
      sectionRow({ title: '', section_order: '3', section_name: 'Ending', section_kind: 'conclusion', rubric_order: '2', rubric_label: 'Organisation' }),
    ])),
    /Section orders must start at 1 and have no gaps/,
  );
});

test('a part that can repeat cannot ask for more copies than it allows', () => {
  assert.throws(
    () => parseWritingCsv(csv([sectionRow({ section_repeatable: 'yes', section_min_count: '3', section_max_count: '2' })])),
    /section_max_count must be at least section_min_count/,
  );
});

test('counts on a part that cannot repeat are refused, not silently dropped', () => {
  assert.throws(
    () => parseWritingCsv(csv([sectionRow({ section_min_count: '2' })])),
    /only apply when section_repeatable is yes/,
  );
});

test('a mark row can only name parts the task actually has', () => {
  assert.throws(
    () => parseWritingCsv(csv([sectionRow({ rubric_applies_to: 'Introduction' })])),
    /not a section_name in this CSV/,
  );
});

test('a task needs both a section plan and something to mark', () => {
  assert.throws(
    () => parseWritingCsv(csv([{ title: 'Loose task', rubric_order: '1', rubric_label: 'Ideas', rubric_max_score: '5' }])),
    /at least one section row/,
  );
  assert.throws(
    () => parseWritingCsv(csv([{ title: 'Loose task', section_order: '1', section_name: 'Opening' }])),
    /at least one mark row/,
  );
});

test('a due date is either empty or a real calendar day', () => {
  assert.throws(() => parseWritingCsv(csv([sectionRow({ due_date: '12/11/2026' })])), /YYYY-MM-DD/);
  assert.throws(() => parseWritingCsv(csv([sectionRow({ due_date: '2026-02-30' })])), /not a real date/);
});

test('yes or no columns say yes or no', () => {
  assert.throws(() => parseWritingCsv(csv([sectionRow({ section_required: 'maybe' })])), /section_required must be yes or no/);
});

test('the word ceiling cannot sit under the floor', () => {
  assert.throws(() => parseWritingCsv(csv([sectionRow({ min_words: '300', max_words: '200' })])), /min_words cannot be above max_words/);
});

test('a file with no rows of its own is not a task', () => {
  assert.throws(() => parseWritingCsv('title,section_order\r\n'), /header row and at least one row/);
});

test('an unquoted comma is explained, not just counted', () => {
  const broken = csv([sectionRow({ transitions: 'First of all, next', rubric_applies_to: 'Beginning' })])
    .replace('"First of all, next"', 'First of all, next');
  assert.throws(
    () => parseWritingCsv(broken),
    /Row 2: has 33 values, but the header row has 32\..*wrap.*quote marks/s,
  );
});

test('the patch fills the builder but leaves the class and the goals alone', () => {
  const patch = formPatchFromCsv(parseWritingCsv(csv([sectionRow()])));
  assert.equal(patch.title, 'Retell a myth');
  assert.equal(patch.writingType, 'story');
  assert.deepEqual(patch.sections.map((row) => row.key), ['beginning']);
  assert.deepEqual(patch.rubric.map((row) => row.maxScore), [4]);
  assert.deepEqual(patch.supports.wordBank, []);
  assert.equal(patch.workflow.requireNotebookCheck, true);
  assert.equal('classId' in patch, false);
  assert.equal('goals' in patch, false);
});
