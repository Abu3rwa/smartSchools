import {
  resolvePracticeQuestionType,
  PRACTICE_PAIR_SEPARATOR,
  PRACTICE_TERM_SEPARATOR,
  PRACTICE_VARIANT_SEPARATOR,
  PRACTICE_ORDER_SEPARATOR,
  PRACTICE_MIN_PAIRS,
  PRACTICE_MIN_ORDER_ITEMS,
  PRACTICE_MAX_ORDER_ITEMS,
  PRACTICE_MAX_OPTIONS
} from '../../constants/practiceQuestionTypes.js';
import { normalizeShortText, parseMatchingPairs } from '../../validators/mapPracticeValidators.js';
import { gradeNumericAgainstRule, rationalToText, parseNumericValue } from './numericAnswer.js';

export const BLANK_TOKEN_PATTERN = /\{\{\s*(?:blank:)?\s*([A-Za-z0-9_-]+)\s*\}\}/g;

const splitSegments = (value, separator) => String(value ?? '')
  .split(separator)
  .map((part) => part.trim())
  .filter(Boolean);

const normalizeKey = (value) => String(value ?? '').trim().toUpperCase();

export const parseOptionKeySet = (value, { max = PRACTICE_MAX_OPTIONS } = {}) => {
  const keys = Array.from(new Set(splitSegments(value, PRACTICE_PAIR_SEPARATOR).map(normalizeKey))).filter(Boolean);
  if (keys.length < 2) return { keys: [], error: `Expected at least 2 correct option keys separated by '${PRACTICE_PAIR_SEPARATOR}'.` };
  if (keys.length > max) return { keys: [], error: `Expected at most ${max} correct option keys.` };
  return { keys, error: null };
};

export const readMatchingDefinition = (value) => {
  const { pairs, invalid } = parseMatchingPairs(value);
  if (invalid.length) {
    return { pairs: [], error: `Each pair needs ${PRACTICE_TERM_SEPARATOR} between the term and its match: ${invalid.join(', ')}` };
  }
  if (pairs.length < PRACTICE_MIN_PAIRS) {
    return { pairs: [], error: `Expected at least ${PRACTICE_MIN_PAIRS} pairs separated by '${PRACTICE_PAIR_SEPARATOR}'.` };
  }
  return { pairs, error: null };
};

const hashId = (value, salt = '') => {
  let hash = 2166136261;
  const source = `${salt}::${value}`;
  for (const character of source) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

/**
 * Item ids must not reveal the authored order, because the student payload carries both the
 * shuffled items and the id key.
 */
export const createOrderingItems = (texts, { salt = '' } = {}) => {
  const seen = new Set();
  const items = [];
  texts.forEach((text) => {
    const key = normalizeShortText(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push({ id: `i${hashId(key, salt)}`, text: String(text).trim() });
  });
  return items;
};

export const parseOrderingItems = (value, { salt = '' } = {}) => {
  const texts = splitSegments(value, PRACTICE_ORDER_SEPARATOR);
  if (texts.length < PRACTICE_MIN_ORDER_ITEMS) {
    return { items: [], error: `Expected at least ${PRACTICE_MIN_ORDER_ITEMS} items separated by '${PRACTICE_ORDER_SEPARATOR}'.` };
  }
  if (texts.length > PRACTICE_MAX_ORDER_ITEMS) {
    return { items: [], error: `Expected at most ${PRACTICE_MAX_ORDER_ITEMS} items.` };
  }
  const items = createOrderingItems(texts, { salt });
  if (items.length < PRACTICE_MIN_ORDER_ITEMS) {
    return { items: [], error: 'Ordering items must all be different.' };
  }
  return { items, error: null };
};

export const encodeOrderingKey = (items = []) => items.map((item) => String(item?.id || '').trim()).filter(Boolean).join(PRACTICE_ORDER_SEPARATOR);

export const decodeOrderingResponse = (response) => {
  if (Array.isArray(response)) {
    return response
      .map((entry) => (entry && typeof entry === 'object' ? String(entry.id ?? '') : String(entry ?? '')))
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return splitSegments(response, PRACTICE_ORDER_SEPARATOR);
};

export const findBlankTokens = (prompt) => {
  const ids = [];
  const pattern = new RegExp(BLANK_TOKEN_PATTERN.source, 'g');
  let match = pattern.exec(String(prompt ?? ''));
  while (match) {
    if (!ids.includes(match[1])) ids.push(match[1]);
    match = pattern.exec(String(prompt ?? ''));
  }
  return ids;
};

export const renderBlankSegments = (prompt, blanks = []) => {
  const labelById = new Map(blanks.map((blank) => [String(blank.id), blank.label || '']));
  const source = String(prompt ?? '');
  const segments = [];
  const pattern = new RegExp(BLANK_TOKEN_PATTERN.source, 'g');
  let cursor = 0;
  let match = pattern.exec(source);
  while (match) {
    if (match.index > cursor) segments.push({ type: 'text', text: source.slice(cursor, match.index) });
    segments.push({ type: 'blank', id: match[1], label: labelById.get(match[1]) || '' });
    cursor = match.index + match[0].length;
    match = pattern.exec(source);
  }
  if (cursor < source.length) segments.push({ type: 'text', text: source.slice(cursor) });
  return segments;
};

/**
 * Accepts `answer~also-accepted|second::other` — ids are optional and blanks fall back to
 * positional ids (b1, b2, ...) in the order they appear in the prompt.
 */
export const parseBlankDefinitions = (value, prompt) => {
  const tokenIds = findBlankTokens(prompt);
  if (!tokenIds.length) {
    return { blanks: [], error: 'The question text needs at least one blank written as {{b1}}.' };
  }

  const chunks = splitSegments(value, PRACTICE_PAIR_SEPARATOR);
  if (!chunks.length) return { blanks: [], error: 'Every blank needs at least one accepted answer.' };

  const splitChunk = (chunk) => {
    const splitIndex = chunk.indexOf(PRACTICE_TERM_SEPARATOR);
    if (splitIndex === -1) return { id: null, answers: chunk };
    return {
      id: chunk.slice(0, splitIndex).trim(),
      answers: chunk.slice(splitIndex + PRACTICE_TERM_SEPARATOR.length).trim()
    };
  };

  const parsed = chunks.map(splitChunk);
  const keyed = parsed.filter((entry) => entry.id && tokenIds.includes(entry.id)).length;
  const blanks = [];
  const seen = new Set();

  let entries;
  if (keyed === parsed.length) {
    entries = parsed;
  } else if (keyed === 0) {
    if (parsed.length !== tokenIds.length) {
      return {
        blanks: [],
        error: `The question has ${tokenIds.length} blank(s) but the answer defines ${parsed.length}. Name each blank, for example ${tokenIds[0]}::answer, or list them in order.`
      };
    }
    entries = parsed.map((entry, index) => ({ ...entry, id: tokenIds[index] }));
  } else {
    return { blanks: [], error: 'Blank answers must either all name their blank or all follow the blank order.' };
  }

  entries.forEach((entry) => {
    const id = String(entry.id || '').trim();
    if (!id || !tokenIds.includes(id) || seen.has(id)) return;
    const accepts = Array.from(new Set(splitSegments(entry.answers, PRACTICE_VARIANT_SEPARATOR)
      .map((answer) => answer.trim())
      .filter(Boolean)));
    if (!accepts.length) return;
    seen.add(id);
    blanks.push({ id, accepts, caseSensitive: false, label: '' });
  });

  const missing = tokenIds.filter((tokenId) => !seen.has(tokenId));
  if (missing.length) {
    return { blanks: [], error: `Every blank needs an accepted answer. Missing: ${missing.join(', ')}` };
  }
  return { blanks, error: null };
};

const NUMERIC_MODES = { exact: 'exact', tol: 'tolerance', tolerance: 'tolerance', range: 'range', rel: 'relative', relative: 'relative' };

export const parseNumericRule = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return { rule: null, error: 'A numeric answer rule is required.' };

  if (!raw.includes(PRACTICE_PAIR_SEPARATOR) && !raw.includes(PRACTICE_TERM_SEPARATOR)) {
    if (!parseNumericValue(raw, { allowFractions: true })) {
      return { rule: null, error: `Could not read a number from "${raw}".` };
    }
    return { rule: { mode: 'exact', value: raw }, error: null };
  }

  const segments = splitSegments(raw, PRACTICE_PAIR_SEPARATOR);
  const rule = { mode: 'exact', value: '' };
  let sawHead = false;

  for (const segment of segments) {
    const splitIndex = segment.indexOf(PRACTICE_TERM_SEPARATOR);
    const head = splitIndex === -1 ? segment : segment.slice(0, splitIndex).trim().toLowerCase();
    const body = splitIndex === -1 ? segment : segment.slice(splitIndex + PRACTICE_TERM_SEPARATOR.length).trim();

    if (!sawHead) {
      const mode = NUMERIC_MODES[head] || 'exact';
      const parts = splitSegments(body || segment, PRACTICE_VARIANT_SEPARATOR);
      if (mode === 'range') {
        if (parts.length < 2) return { rule: null, error: 'A range rule needs a low and a high value, for example range::10~20.' };
        rule.mode = 'range';
        rule.min = parts[0];
        rule.max = parts[1];
        delete rule.value;
      } else {
        rule.mode = mode === 'exact' && head !== 'exact' ? 'exact' : mode;
        if (!parts.length) return { rule: null, error: 'A numeric rule needs a value.' };
        rule.value = parts[0];
        if (parts[1] && (mode === 'tolerance' || mode === 'relative')) rule.tolerance = parts[1];
      }
      sawHead = true;
      continue;
    }

    if (!body) return { rule: null, error: `Empty option in numeric rule segment "${segment}".` };
    if (head === 'unit') rule.unit = body;
    else if (head === 'decimal' || head === 'decimals') rule.decimalPlaces = body;
    else if (head === 'tolerance' || head === 'tol') rule.tolerance = body;
    else if (head === 'fractions') rule.allowFractions = body === 'on' || body === 'true';
    else if (head === 'percent') rule.allowPercent = body === 'on' || body === 'true';
    else if (head === 'mode') rule.mode = NUMERIC_MODES[body.toLowerCase()] || 'exact';
    else return { rule: null, error: `Unknown numeric rule option "${head}".` };
  }

  if (rule.mode === 'range') {
    if (!parseNumericValue(rule.min, { allowFractions: true }) || !parseNumericValue(rule.max, { allowFractions: true })) {
      return { rule: null, error: 'A range needs two readable numbers.' };
    }
    return { rule, error: null };
  }

  if (!parseNumericValue(rule.value, { allowFractions: true })) {
    return { rule: null, error: `Could not read a number from "${rule.value}".` };
  }
  if (rule.tolerance && !parseNumericValue(rule.tolerance, { allowFractions: true })) {
    return { rule: null, error: `Could not read the tolerance from "${rule.tolerance}".` };
  }
  return { rule, error: null };
};

export const encodeResponseMap = (valuesById) => JSON.stringify(valuesById || {});
export const decodeResponseMap = (response) => {
  if (Array.isArray(response)) {
    // The student UI stores [{ id, text }] so a typed answer can never become a Mongo document key.
    return Object.fromEntries(response
      .filter((entry) => entry && typeof entry === 'object' && String(entry.id ?? '').trim())
      .map((entry) => [String(entry.id).trim(), String(entry.text ?? '').trim()]));
  }
  if (response && typeof response === 'object') {
    return Object.fromEntries(Object.entries(response).map(([key, value]) => [String(key).trim(), String(value ?? '').trim()]));
  }
  const raw = String(response ?? '').trim();
  if (!raw) return {};
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [String(key).trim(), String(value ?? '').trim()]));
      }
    } catch {
      return {};
    }
  }
  const values = {};
  splitSegments(raw, PRACTICE_PAIR_SEPARATOR).forEach((chunk) => {
    const splitIndex = chunk.indexOf(PRACTICE_TERM_SEPARATOR);
    if (splitIndex === -1) return;
    values[chunk.slice(0, splitIndex).trim()] = chunk.slice(splitIndex + PRACTICE_TERM_SEPARATOR.length).trim();
  });
  return values;
};

export const describeObjectiveAnswer = (grade) => {
  if (!grade || !grade.detail) return '';
  const { detail } = grade;
  if (detail.type === 'ordering') {
    const textById = new Map(detail.order.map((entry) => [entry.id, entry.text]));
    return detail.correctOrder.map((id) => textById.get(id) || id).join(` ${PRACTICE_ORDER_SEPARATOR} `);
  }
  if (detail.type === 'matching') return detail.pairs.map((entry) => `${entry.left} = ${entry.expected}`).join('; ');
  if (detail.type === 'fill_in_blank') return detail.blanks.map((entry) => `${entry.id}: ${entry.accepts[0]}`).join('; ');
  if (detail.type === 'numeric') return detail.display || '';
  if (detail.type === 'multiple_select') return (detail.keys || []).join(PRACTICE_PAIR_SEPARATOR);
  return '';
};

/**
 * The teacher pool editor collects structured rows while the CSV carries the same grammar as
 * text. Both funnel into one validator by turning the editor input into its column equivalent.
 */
export const definitionToColumns = (definition = {}) => {
  const columns = {};
  const pairs = Array.isArray(definition?.matchingPairs) ? definition.matchingPairs : null;
  if (pairs) {
    columns.matching_pairs = pairs
      .map((pair) => (typeof pair === 'string' ? pair : `${String(pair?.left ?? '').trim()}${PRACTICE_TERM_SEPARATOR}${String(pair?.right ?? '').trim()}`))
      .filter(Boolean)
      .join(PRACTICE_PAIR_SEPARATOR);
  }

  const items = Array.isArray(definition?.orderingItems) ? definition.orderingItems : null;
  if (items) {
    columns.ordering_items = items
      .map((item) => (typeof item === 'string' ? item.trim() : String(item?.text ?? '').trim()))
      .filter(Boolean)
      .join(PRACTICE_ORDER_SEPARATOR);
  }

  const blanks = Array.isArray(definition?.blanks) ? definition.blanks : null;
  if (blanks) {
    columns.blank_answers = blanks
      .map((blank) => {
        const accepts = (Array.isArray(blank?.accepts) ? blank.accepts : [blank?.accepts])
          .map((answer) => String(answer ?? '').trim())
          .filter(Boolean);
        return `${String(blank?.id ?? '').trim()}${PRACTICE_TERM_SEPARATOR}${accepts.join(PRACTICE_VARIANT_SEPARATOR)}`;
      })
      .filter((entry) => !entry.startsWith(PRACTICE_TERM_SEPARATOR))
      .join(PRACTICE_PAIR_SEPARATOR);
  }

  const rule = definition?.numericRule;
  if (rule && typeof rule === 'object') {
    const head = rule.mode === 'range'
      ? `range${PRACTICE_TERM_SEPARATOR}${String(rule.min ?? '').trim()}${PRACTICE_VARIANT_SEPARATOR}${String(rule.max ?? '').trim()}`
      : `${String(rule.mode || 'exact')}${PRACTICE_TERM_SEPARATOR}${String(rule.value ?? '').trim()}${rule.tolerance ? `${PRACTICE_VARIANT_SEPARATOR}${String(rule.tolerance).trim()}` : ''}`;
    const options = [];
    if (String(rule.unit ?? '').trim()) options.push(`unit${PRACTICE_TERM_SEPARATOR}${String(rule.unit).trim()}`);
    if (String(rule.decimalPlaces ?? '').trim()) options.push(`decimals${PRACTICE_TERM_SEPARATOR}${String(rule.decimalPlaces).trim()}`);
    if (rule.allowFractions) options.push(`fractions${PRACTICE_TERM_SEPARATOR}on`);
    if (rule.allowPercent) options.push(`percent${PRACTICE_TERM_SEPARATOR}on`);
    columns.numeric_rule = [head, ...options].filter(Boolean).join(PRACTICE_PAIR_SEPARATOR);
  } else if (typeof rule === 'string' && rule.trim()) {
    columns.numeric_rule = rule.trim();
  }

  if (definition?.correctAnswer !== undefined && definition?.correctAnswer !== null) {
    columns.correct_answer = Array.isArray(definition.correctAnswer)
      ? definition.correctAnswer.map((entry) => String(entry ?? '').trim()).filter(Boolean).join(PRACTICE_PAIR_SEPARATOR)
      : String(definition.correctAnswer).trim();
  }
  if (Array.isArray(definition?.correctOptionIds) && definition.correctOptionIds.length) {
    columns.correct_answer = definition.correctOptionIds.map((entry) => String(entry ?? '').trim()).filter(Boolean).join(PRACTICE_PAIR_SEPARATOR);
  }
  if (String(definition?.passageText ?? '').trim()) {
    columns.passage_text = String(definition.passageText).trim();
    columns.passage_title = String(definition.passageTitle ?? '').trim();
    columns.passage_id = String(definition.passageId ?? '').trim();
  }
  return columns;
};

/**
 * Read the type-specific definition from authoring columns. Both the MAP Practice CSV and
 * the Standards pool CSV use the same column names and the same string grammars.
 */
export const readTypeDefinition = ({ questionType, prompt = '', columns = {}, definition = null, salt = '' }) => {
  const resolved = resolvePracticeQuestionType(questionType);
  const source = definition ? { ...columns, ...definitionToColumns(definition) } : columns;
  const read = (name) => String(source[name] ?? '').trim();

  if (resolved === 'matching') {
    const { pairs, error } = readMatchingDefinition(read('matching_pairs'));
    return {
      questionType: resolved,
      fields: { matchingPairs: pairs },
      correctAnswer: pairs.map((pair) => `${pair.left}::${pair.right}`).join(PRACTICE_PAIR_SEPARATOR),
      error
    };
  }

  if (resolved === 'ordering') {
    const { items, error } = parseOrderingItems(read('ordering_items'), { salt });
    return {
      questionType: resolved,
      fields: { orderingItems: items },
      correctAnswer: encodeOrderingKey(items),
      error
    };
  }

  if (resolved === 'fill_in_blank') {
    const { blanks, error } = parseBlankDefinitions(read('blank_answers'), prompt || read('stem'));
    return {
      questionType: resolved,
      fields: { blanks },
      correctAnswer: blanks.map((blank) => `${blank.id}::${blank.accepts.join(PRACTICE_VARIANT_SEPARATOR)}`).join(PRACTICE_PAIR_SEPARATOR),
      error
    };
  }

  if (resolved === 'numeric_response') {
    const { rule, error } = parseNumericRule(read('numeric_rule') || read('correct_answer'));
    return {
      questionType: resolved,
      fields: { numericRule: rule || null },
      correctAnswer: rule ? `${rule.mode === 'range' ? `${rule.min}-${rule.max}` : rule.value}${rule.tolerance ? ` ±${rule.tolerance}${rule.mode === 'relative' ? '%' : ''}` : ''}${rule.unit ? ` ${rule.unit}` : ''}` : '',
      error
    };
  }

  if (resolved === 'multiple_select') {
    const { keys, error } = parseOptionKeySet(read('correct_answer'));
    return {
      questionType: resolved,
      fields: {},
      correctAnswer: keys.join(PRACTICE_PAIR_SEPARATOR),
      error
    };
  }

  return { questionType: resolved, fields: {}, correctAnswer: read('correct_answer'), error: null };
};

export { gradeNumericAgainstRule, rationalToText };
