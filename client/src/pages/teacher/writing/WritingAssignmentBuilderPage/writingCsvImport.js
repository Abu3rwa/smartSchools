/**
 * CSV import for writing tasks: one file builds one task, and the rows land in the
 * builder rather than in the database, so the teacher always sees the task before
 * publishing it. Every rule here mirrors validateForm / buildPayload in form.js and
 * the limits the server enforces, and a bad row rejects the whole file by row number.
 */
import { SECTION_KINDS, WRITING_TYPES } from '../../../../constants/writingPresets.js';
import {
  MAX_CSV_BYTES,
  csvCell,
  normalizeHeader,
  parseCsvRows,
} from '../../../../utils/csvCells.js';
import { slugify, emptySupports } from './form.js';

const MAX_SECTIONS = 20;
const MAX_RUBRIC_ROWS = 20;
const LIST = '|';

const SHARED_COLUMNS = [
  'title', 'writing_type', 'instructions', 'topic', 'due_date', 'min_words', 'max_words',
  'expected_level', 'publish_feedback_first', 'require_notebook_check',
  'feedback_limits', 'word_bank', 'transitions', 'sentence_starters', 'guiding_questions',
  'planner_prompt', 'model_text',
];

const SECTION_COLUMNS = [
  'section_order', 'section_name', 'section_kind', 'section_required', 'section_repeatable',
  'section_min_count', 'section_max_count', 'section_min_words', 'section_instructions',
  'section_criteria',
];

const RUBRIC_COLUMNS = [
  'rubric_order', 'rubric_label', 'rubric_description', 'rubric_max_score', 'rubric_applies_to',
];

const KNOWN_COLUMNS = new Set([...SHARED_COLUMNS, ...SECTION_COLUMNS, ...RUBRIC_COLUMNS]);

const tooLong = (value, max, column, where) => {
  if (value.length > max) {
    throw new Error(`${where}: ${column} must be ${max} characters or fewer (this one is ${value.length}).`);
  }
  return value;
};

const wholeNumber = (value, { min, max, column, where }) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${where}: ${column} must be a whole number from ${min} to ${max}.`);
  }
  return parsed;
};

const yesOrNo = (value, column, where, fallback = false) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallback;
  if (['yes', 'true', '1'].includes(text)) return true;
  if (['no', 'false', '0'].includes(text)) return false;
  throw new Error(`${where}: ${column} must be yes or no.`);
};

const listFrom = (value) => String(value || '').split(LIST).map((item) => item.trim()).filter(Boolean);

const checkListColumn = (items, { max, itemMax, column, where }) => {
  if (items.length > max) throw new Error(`${where}: ${column} can hold up to ${max} items.`);
  for (const item of items) {
    if (item.length > itemMax) {
      throw new Error(`${where}: "${item.slice(0, 30)}" in ${column} is longer than ${itemMax} characters.`);
    }
  }
  return items;
};

const assertDueDate = (value, where) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${where}: due_date must be written as YYYY-MM-DD.`);
  }
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${where}: due_date is not a real date.`);
  }
  return text;
};

/** Rows share one task, so a second row may not quietly rename it. */
const assertSharedMatches = (records, firstIndex) => {
  for (const [index, record] of records.entries()) {
    if (index === firstIndex) continue;
    for (const column of SHARED_COLUMNS) {
      const value = String(record[column] || '').trim();
      if (value && value !== String(records[firstIndex][column] || '').trim()) {
        throw new Error(`Row ${index + 2}: ${column} is different from the titled row. Use one CSV per writing task.`);
      }
    }
  }
};

const buildSections = (records) => {
  const orders = new Set();
  const sections = [];
  for (const [index, record] of records.entries()) {
    const where = `Row ${index + 2}`;
    const cells = SECTION_COLUMNS.map((column) => String(record[column] || '').trim());
    if (!cells.some(Boolean)) continue;
    const orderValue = String(record.section_order || '').trim();
    const name = String(record.section_name || '').trim();
    if (!orderValue || !name) {
      throw new Error(`${where}: a section row needs both section_order and section_name.`);
    }
    const order = wholeNumber(orderValue, { min: 1, max: MAX_SECTIONS, column: 'section_order', where });
    if (orders.has(order)) throw new Error(`${where}: section_order ${order} is used twice.`);
    orders.add(order);

    const kind = String(record.section_kind || '').trim().toLowerCase() || 'body';
    if (!SECTION_KINDS.includes(kind)) {
      throw new Error(`${where}: section_kind must be one of ${SECTION_KINDS.join(', ')}.`);
    }
    const repeatable = yesOrNo(record.section_repeatable, 'section_repeatable', where);
    const minCount = wholeNumber(record.section_min_count, { min: 1, max: MAX_SECTIONS, column: 'section_min_count', where }) || 1;
    const maxCount = wholeNumber(record.section_max_count, { min: 1, max: MAX_SECTIONS, column: 'section_max_count', where }) || minCount;
    if (!repeatable && (minCount !== 1 || maxCount !== 1)) {
      throw new Error(`${where}: section_min_count and section_max_count only apply when section_repeatable is yes.`);
    }
    if (repeatable && maxCount < minCount) {
      throw new Error(`${where}: section_max_count must be at least section_min_count.`);
    }

    sections.push({
      order,
      key: slugify(name),
      label: tooLong(name, 120, 'section_name', where),
      kind,
      instructions: tooLong(String(record.section_instructions || '').trim(), 2000, 'section_instructions', where),
      required: yesOrNo(record.section_required, 'section_required', where, true),
      repeatable,
      minCount,
      maxCount,
      minWords: wholeNumber(record.section_min_words, { min: 0, max: 5000, column: 'section_min_words', where }) || 0,
      criteria: checkListColumn(listFrom(record.section_criteria), {
        max: 10, itemMax: 200, column: 'section_criteria', where,
      }),
    });
  }

  if (!sections.length) throw new Error('The CSV needs at least one section row (section_order and section_name).');
  sections.sort((a, b) => a.order - b.order);
  sections.forEach((section, position) => {
    if (section.order !== position + 1) {
      throw new Error(`Section orders must start at 1 and have no gaps. Section ${position + 1} is numbered ${section.order}.`);
    }
  });
  if (sections.some((section) => !section.key)) {
    throw new Error('Every section name needs letters or numbers the task can store it under.');
  }
  const keys = new Set();
  for (const section of sections) {
    if (keys.has(section.key)) throw new Error(`Two sections are both stored as "${section.key}". Rename one.`);
    keys.add(section.key);
  }
  return sections.map(({ order, ...section }) => section);
};

const buildRubric = (records, sections) => {
  const names = new Map(sections.map((section) => [section.label.toLowerCase(), section.key]));
  const orders = new Set();
  const rows = [];
  for (const [index, record] of records.entries()) {
    const where = `Row ${index + 2}`;
    const cells = RUBRIC_COLUMNS.map((column) => String(record[column] || '').trim());
    if (!cells.some(Boolean)) continue;
    const orderValue = String(record.rubric_order || '').trim();
    const label = String(record.rubric_label || '').trim();
    if (!orderValue || !label) {
      throw new Error(`${where}: a mark row needs both rubric_order and rubric_label.`);
    }
    const order = wholeNumber(orderValue, { min: 1, max: MAX_RUBRIC_ROWS, column: 'rubric_order', where });
    if (orders.has(order)) throw new Error(`${where}: rubric_order ${order} is used twice.`);
    orders.add(order);

    const maxScore = wholeNumber(record.rubric_max_score, { min: 1, max: 100, column: 'rubric_max_score', where });
    if (!maxScore) throw new Error(`${where}: rubric_max_score must be at least 1.`);

    const appliesTo = listFrom(record.rubric_applies_to).filter((item) => item !== '*');
    if (appliesTo.length) {
      for (const item of appliesTo) {
        if (!names.has(item.toLowerCase())) {
          throw new Error(`${where}: rubric_applies_to names "${item}", which is not a section_name in this CSV.`);
        }
      }
    }

    rows.push({
      order,
      key: slugify(label),
      label: tooLong(label, 120, 'rubric_label', where),
      description: tooLong(String(record.rubric_description || '').trim(), 1000, 'rubric_description', where),
      maxScore,
      appliesToSections: appliesTo.length ? appliesTo.map((item) => names.get(item.toLowerCase())) : ['*'],
    });
  }

  if (!rows.length) throw new Error('The CSV needs at least one mark row (rubric_order and rubric_label).');
  rows.sort((a, b) => a.order - b.order);
  rows.forEach((row, position) => {
    if (row.order !== position + 1) {
      throw new Error(`Mark row orders must start at 1 and have no gaps. Mark row ${position + 1} is numbered ${row.order}.`);
    }
  });
  const keys = new Set();
  for (const row of rows) {
    if (keys.has(row.key)) throw new Error(`Two mark rows are both stored as "${row.key}". Rename one.`);
    keys.add(row.key);
  }
  return rows.map(({ order, ...row }) => row);
};

/** Returns a form patch for the builder, never a saved assignment. */
export const parseWritingCsv = (csvText) => {
  const source = String(csvText || '');
  if (new TextEncoder().encode(source).length > MAX_CSV_BYTES) {
    throw new Error('The CSV is larger than 700 KB.');
  }
  const rows = parseCsvRows(source);
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one row of writing task details.');

  const headers = rows[0].map(normalizeHeader);
  if (new Set(headers).size !== headers.length) throw new Error('The CSV has the same column name twice.');
  if (headers.includes('max_drafts')) {
    throw new Error('The CSV has a max_drafts column, which is no longer used. Students keep revising until you publish the feedback that marks the work ready. Delete that column and import again.');
  }
  const unknown = headers.filter((header) => header && !KNOWN_COLUMNS.has(header));
  if (unknown.length) {
    throw new Error(`The CSV has column${unknown.length > 1 ? 's' : ''} this import does not know: ${unknown.join(', ')}.`);
  }
  if (!headers.includes('title')) throw new Error('The CSV needs a title column.');

  const records = rows.slice(1).map((cells, index) => {
    const where = `Row ${index + 2}`;
    const overflow = cells.slice(headers.length).filter((cell) => cell.trim());
    if (overflow.length) {
      throw new Error(`${where}: has ${cells.length} values, but the header row has ${headers.length}. `
        + 'That usually means a cell holds a comma and was not wrapped in quote marks. '
        + `The values past the last column are: ${overflow.map((cell) => `"${cell}"`).join(', ')}.`);
    }
    return Object.fromEntries(headers.map((header, position) => [header, cells[position] || '']));
  });

  const first = records.findIndex((record) => String(record.title || '').trim());
  if (first < 0) throw new Error('The CSV needs one row with the writing task title.');
  assertSharedMatches(records, first);

  const head = records[first];
  const title = String(head.title || '').trim();
  if (!title) throw new Error('The writing task needs a title.');
  tooLong(title, 200, 'title', 'The first row');

  const writingType = String(head.writing_type || '').trim().toLowerCase() || 'essay';
  if (!WRITING_TYPES.includes(writingType)) {
    throw new Error(`writing_type must be one of ${WRITING_TYPES.join(', ')}.`);
  }

  const minWords = wholeNumber(head.min_words, { min: 0, max: 20000, column: 'min_words', where: 'The first row' }) || 0;
  const maxWords = wholeNumber(head.max_words, { min: 0, max: 20000, column: 'max_words', where: 'The first row' }) || 0;
  if (maxWords && minWords > maxWords) {
    throw new Error('min_words cannot be above max_words.');
  }

  const sections = buildSections(records);
  const rubric = buildRubric(records, sections);

  return {
    title,
    writingType,
    instructions: tooLong(String(head.instructions || '').trim(), 6000, 'instructions', 'The first row'),
    topic: tooLong(String(head.topic || '').trim(), 500, 'topic', 'The first row'),
    dueDate: assertDueDate(head.due_date, 'The first row'),
    minWords,
    maxWords,
    expectedLevel: tooLong(String(head.expected_level || '').trim(), 200, 'expected_level', 'The first row'),
    sections,
    rubric,
    supports: {
      wordBank: checkListColumn(listFrom(head.word_bank), { max: 60, itemMax: 60, column: 'word_bank', where: 'The first row' }),
      transitions: checkListColumn(listFrom(head.transitions), { max: 40, itemMax: 80, column: 'transitions', where: 'The first row' }),
      sentenceStarters: checkListColumn(listFrom(head.sentence_starters), { max: 30, itemMax: 160, column: 'sentence_starters', where: 'The first row' }),
      guidingQuestions: checkListColumn(listFrom(head.guiding_questions), { max: 20, itemMax: 240, column: 'guiding_questions', where: 'The first row' }),
      plannerPrompt: tooLong(String(head.planner_prompt || '').trim(), 2000, 'planner_prompt', 'The first row'),
      modelText: tooLong(String(head.model_text || '').trim(), 6000, 'model_text', 'The first row'),
    },
    workflow: {
      teacherPublishesFeedback: yesOrNo(head.publish_feedback_first, 'publish_feedback_first', 'The first row', true),
      requireNotebookCheck: yesOrNo(head.require_notebook_check, 'require_notebook_check', 'The first row', true),
      autoSuggestNextStep: true,
    },
    aiConstraints: tooLong(String(head.feedback_limits || '').trim(), 2000, 'feedback_limits', 'The first row'),
  };
};

/**
 * The builder patch for a parsed file. The sheet never names a class or a per-student
 * goal, so those fields are left untouched and the teacher still presses Publish.
 */
export const formPatchFromCsv = (parsed) => ({
  title: parsed.title,
  writingType: parsed.writingType,
  instructions: parsed.instructions,
  topic: parsed.topic,
  dueDate: parsed.dueDate,
  minWords: parsed.minWords,
  maxWords: parsed.maxWords,
  expectedLevel: parsed.expectedLevel,
  sections: parsed.sections,
  rubric: parsed.rubric,
  supports: { ...emptySupports(), ...parsed.supports },
  workflow: { ...parsed.workflow },
  aiConstraints: parsed.aiConstraints,
});

export const WRITING_CSV_HEADERS = [
  'title', 'writing_type', 'instructions', 'topic', 'due_date', 'min_words', 'max_words',
  'expected_level', 'publish_feedback_first', 'require_notebook_check',
  'feedback_limits', 'word_bank', 'transitions', 'sentence_starters', 'guiding_questions',
  'planner_prompt', 'model_text',
  'section_order', 'section_name', 'section_kind', 'section_required', 'section_repeatable',
  'section_min_count', 'section_max_count', 'section_min_words', 'section_instructions',
  'section_criteria',
  'rubric_order', 'rubric_label', 'rubric_description', 'rubric_max_score', 'rubric_applies_to',
];

const blankShared = (overrides = {}) => Object.fromEntries(
  WRITING_CSV_HEADERS.map((column) => [column, overrides[column] ?? '']),
);

export const buildWritingCsvTemplate = () => {
  const firstRow = blankShared({
    title: 'Opinion essay: school uniforms',
    writing_type: 'essay',
    instructions: 'Say what you think about school uniforms. Give two reasons.',
    topic: 'Should students choose their own clothes for school?',
    due_date: '2026-11-12',
    min_words: '120',
    max_words: '250',
    expected_level: 'Grade 6',
    publish_feedback_first: 'yes',
    require_notebook_check: 'yes',
    feedback_limits: 'Never rewrite the student sentences. Point at one line.',
    word_bank: 'because|however|for example',
    transitions: 'First of all|Next|In addition',
    sentence_starters: 'I believe that… because…',
    guiding_questions: 'Who is affected?|Why does it matter?',
    planner_prompt: 'List your two reasons before you write.',
    model_text: 'I believe students should choose their own clothes, because…',
    section_order: '1',
    section_name: 'Introduction',
    section_kind: 'opening',
    section_required: 'yes',
    section_repeatable: 'no',
    section_min_words: '25',
    section_instructions: 'Say what you think and name your reasons.',
    section_criteria: 'Clear point of view|Sets up the essay',
    rubric_order: '1',
    rubric_label: 'Ideas and content',
    rubric_description: 'The writing answers the task and the point stays clear.',
    rubric_max_score: '5',
  });
  const middleRow = blankShared({
    section_order: '2',
    section_name: 'Body paragraph',
    section_kind: 'body',
    section_required: 'yes',
    section_repeatable: 'yes',
    section_min_count: '2',
    section_max_count: '3',
    section_min_words: '35',
    section_instructions: 'One reason, then a detail or example that proves it.',
    section_criteria: 'Supporting detail|Stays on the point',
    rubric_order: '2',
    rubric_label: 'Organisation',
    rubric_description: 'Parts are in a sensible order and join together smoothly.',
    rubric_max_score: '5',
  });
  const lastRow = blankShared({
    section_order: '3',
    section_name: 'Conclusion',
    section_kind: 'conclusion',
    section_required: 'yes',
    section_repeatable: 'no',
    section_min_words: '20',
    section_instructions: 'Say your view again in new words and why it matters.',
    section_criteria: 'No new arguments|Strong closing',
    rubric_order: '3',
    rubric_label: 'Grammar and punctuation',
    rubric_description: 'Sentences, spelling and punctuation do not confuse the reader.',
    rubric_max_score: '4',
    rubric_applies_to: 'Introduction|Conclusion',
  });

  const rows = [WRITING_CSV_HEADERS, Object.values(firstRow), Object.values(middleRow), Object.values(lastRow)];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
};
