import { PRACTICE_ORDER_SEPARATOR, PRACTICE_PAIR_SEPARATOR } from '../../constants/practiceQuestionTypes.js';

const hashString = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededShuffle = (items, seed) => {
  const result = [...items];
  let state = seed || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

const readPairs = (question) => (Array.isArray(question?.matchingPairs) ? question.matchingPairs : [])
  .map((pair) => ({ left: String(pair?.left ?? '').trim(), right: String(pair?.right ?? '').trim() }))
  .filter((pair) => pair.left && pair.right);

const readPrompt = (question) => String(question?.stem || question?.questionText || '');

/**
 * The authored order, the term-to-definition map and the accepted blank answers are the key,
 * so students get a shuffled presentation that is stable for one student and varies per student.
 */
export const buildMatchingColumns = (question, seed) => {
  const pairs = readPairs(question);
  if (!pairs.length) return { terms: [], choices: [] };
  const choices = Array.from(new Set(pairs.map((pair) => pair.right)));
  return {
    terms: pairs.map((pair) => pair.left),
    choices: seededShuffle(choices, hashString(seed)),
  };
};

export const buildOrderingItems = (question, seed) => {
  const items = (Array.isArray(question?.orderingItems) ? question.orderingItems : [])
    .map((item) => ({ id: String(item?.id ?? '').trim(), text: String(item?.text ?? '').trim() }))
    .filter((item) => item.id && item.text);
  if (!items.length) return [];
  return seededShuffle(items, hashString(`${seed}|order`));
};

export const buildBlankIds = (question) => {
  const authored = (Array.isArray(question?.blanks) ? question.blanks : [])
    .map((blank) => String(blank?.id ?? '').trim())
    .filter(Boolean);
  const tokens = readPrompt(question).match(/\{\{\s*(?:blank:)?\s*([A-Za-z0-9_-]+)\s*\}\}/g) || [];
  const fromPrompt = tokens.map((token) => token.replace(/[{}]|blank:\s*/g, '').trim());
  return Array.from(new Set([...fromPrompt, ...authored]));
};

/** The tolerance, range and accepted variants stay server-side; only the answer format is shown. */
export const buildNumericHint = (question) => {
  const rule = question?.numericRule;
  if (!rule) return null;
  const decimalPlaces = rule.decimalPlaces === undefined || rule.decimalPlaces === null || rule.decimalPlaces === ''
    ? null
    : Number(rule.decimalPlaces);
  return {
    unit: String(rule.unit || ''),
    acceptFractions: Boolean(rule.allowFractions),
    acceptPercent: Boolean(rule.allowPercent),
    decimalPlaces: Number.isFinite(decimalPlaces) ? decimalPlaces : null,
    prompt: rule.unit ? `Enter a number with the unit ${rule.unit}.` : 'Enter a number.',
  };
};

export const buildStudentPresentationFields = (question, seed = '') => {
  const type = String(question?.questionType || '');
  if (type === 'matching') return { matchingColumns: buildMatchingColumns(question, seed) };
  if (type === 'ordering') return { orderingItems: buildOrderingItems(question, seed) };
  if (type === 'fill_in_blank') return { blankIds: buildBlankIds(question) };
  if (type === 'numeric_response') return { numericHint: buildNumericHint(question) };
  return {};
};

// These carry the answer key, so they never leave the server in a student payload.
export const TEACHER_ONLY_QUESTION_FIELDS = [
  'correctAnswer',
  'explanation',
  'distractorNote',
  'matchingPairs',
  'blanks',
  'numericRule',
  'orderingKey',
  'gradingDetail',
];

export const hideTeacherOnlyFields = (payload, { seed = '', extraHiddenFields = [] } = {}) => {
  const safe = Object.fromEntries(Object.entries(payload || {}).filter(([key]) => (
    !TEACHER_ONLY_QUESTION_FIELDS.includes(key) && !extraHiddenFields.includes(key)
  )));
  return { ...safe, ...buildStudentPresentationFields(payload, seed) };
};

const toText = (value) => String(value ?? '').trim();

/**
 * Teachers and history lists read one flat string, so a structured response is rendered back
 * into the words the student chose rather than the opaque item ids.
 */
export const describeStudentResponse = ({ questionType, response, question }) => {
  if (response === null || response === undefined) return '';
  if (!Array.isArray(response) && typeof response === 'object') {
    return Object.entries(response).map(([id, value]) => `${id}: ${toText(value)}`).join('; ');
  }
  if (!Array.isArray(response)) return toText(response);

  if (questionType === 'ordering') {
    const textById = new Map((Array.isArray(question?.orderingItems) ? question.orderingItems : [])
      .map((item) => [toText(item?.id), toText(item?.text)]));
    return response
      .map((entry) => toText(entry && typeof entry === 'object' ? entry.id : entry))
      .filter(Boolean)
      .map((id) => textById.get(id) || id)
      .join(` ${PRACTICE_ORDER_SEPARATOR} `);
  }
  if (questionType === 'fill_in_blank') {
    return response
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => `${toText(entry.id)}: ${toText(entry.text) || '—'}`)
      .join('; ');
  }
  if (questionType === 'matching') {
    return response
      .filter((entry) => entry && typeof entry === 'object' && toText(entry.left))
      .map((entry) => `${toText(entry.left)} = ${toText(entry.right) || '—'}`)
      .join('; ');
  }
  return response.map((entry) => toText(entry && typeof entry === 'object' ? (entry.right || entry.text || entry.id) : entry))
    .filter(Boolean)
    .join(` ${PRACTICE_PAIR_SEPARATOR} `);
};
