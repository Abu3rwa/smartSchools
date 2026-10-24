import { LIVE_QUESTION_KINDS } from '../constants/liveLessonQuestionKinds.js';
import {
  PRACTICE_MAX_OPTIONS,
  PRACTICE_MAX_ORDER_ITEMS,
  PRACTICE_MIN_OPTIONS,
  PRACTICE_MIN_ORDER_ITEMS,
  PRACTICE_MIN_PAIRS,
  PRACTICE_VARIANT_SEPARATOR
} from '../constants/practiceQuestionTypes.js';

export const LIVE_QUESTION_KIND_LABELS = {
  mcq: 'Multiple choice',
  tf: 'True or false',
  multi_select: 'Multiple select',
  matching: 'Match pairs',
  ordering: 'Put in order',
  fill_in_blank: 'Fill in the blank',
  numeric: 'Numeric answer',
  text: 'Written answer'
};

export const LIVE_QUESTION_KIND_ORDER = LIVE_QUESTION_KINDS;

const text = (value) => String(value ?? '').trim();

export const isLiveOptionKind = (kind) => kind === 'mcq' || kind === 'tf' || kind === 'multi_select';

export const isLiveChoiceKind = (kind) => kind === 'mcq' || kind === 'tf';

const OPTION_ID_LABELS = ['a', 'b', 'c', 'd', 'e', 'f'];

const TRUE_FALSE_OPTIONS = () => [
  { id: 'true', text: 'True' },
  { id: 'false', text: 'False' }
];

const blankNumericRule = () => ({
  mode: 'exact',
  value: '',
  min: '',
  max: '',
  tolerance: '',
  unit: '',
  decimalPlaces: '',
  allowFractions: false,
  allowPercent: false
});

const optionRows = (count) =>
  Array.from({ length: count }, (_, index) => ({ id: OPTION_ID_LABELS[index], text: '' }));

/** Every kind starts with the smallest editable set the server will accept. */
const kindDefaults = (kind) => {
  if (kind === 'tf') {
    return { options: TRUE_FALSE_OPTIONS(), correctOptionId: 'true', correctOptionIds: [] };
  }
  if (isLiveOptionKind(kind)) {
    return { options: optionRows(PRACTICE_MIN_OPTIONS + 2), correctOptionId: 'a', correctOptionIds: [] };
  }
  return { options: [], correctOptionId: '', correctOptionIds: [] };
};

export const createLiveQuestion = (kind = 'mcq') => ({
  kind,
  prompt: '',
  ...kindDefaults(kind),
  matchingPairs: kind === 'matching'
    ? Array.from({ length: PRACTICE_MIN_PAIRS }, () => ({ left: '', right: '' }))
    : [],
  orderingItems: kind === 'ordering'
    ? Array.from({ length: PRACTICE_MIN_ORDER_ITEMS }, () => ({ id: '', text: '' }))
    : [],
  blanks: [],
  numericRule: kind === 'numeric' ? blankNumericRule() : undefined,
  guidance: '',
  criteria: '',
  minWords: 0,
  maxWords: 0,
  explanation: ''
});

/**
 * A stored question can omit any field the kind does not use, so the editor fills the shape in
 * once instead of guarding every input.
 */
export const prepareLiveQuestion = (question = {}) => {
  const kind = LIVE_QUESTION_KINDS.includes(question.kind) ? question.kind : 'mcq';
  const defaults = kindDefaults(kind);
  const options = Array.isArray(question.options) && question.options.length
    ? question.options.map((option) => ({ id: text(option?.id), text: text(option?.text) }))
    : defaults.options;
  return {
    ...question,
    kind,
    prompt: text(question.prompt),
    options,
    correctOptionId: text(question.correctOptionId) || defaults.correctOptionId,
    correctOptionIds: (Array.isArray(question.correctOptionIds) ? question.correctOptionIds : [])
      .map(text).filter(Boolean),
    matchingPairs: (question.matchingPairs || []).map((pair) => ({
      left: text(pair?.left),
      right: text(pair?.right)
    })),
    orderingItems: (question.orderingItems || []).map((item) => ({
      id: text(item?.id),
      text: text(item?.text)
    })),
    blanks: (question.blanks || []).map((blank) => ({
      id: text(blank?.id),
      acceptsText: blank?.acceptsText !== undefined
        ? text(blank.acceptsText)
        : (Array.isArray(blank?.accepts) ? blank.accepts : [blank?.accepts])
          .map(text)
          .filter(Boolean)
          .join(PRACTICE_VARIANT_SEPARATOR)
    })),
    numericRule: kind === 'numeric' || question.numericRule
      ? { ...blankNumericRule(), ...(question.numericRule || {}) }
      : undefined,
    guidance: text(question.guidance),
    criteria: text(question.criteria),
    minWords: Number(question.minWords) || 0,
    maxWords: Number(question.maxWords) || 0,
    explanation: text(question.explanation)
  };
};

/**
 * A kind change replaces the kind and nothing else. Rows, key, pairs, blanks and word limits all stay
 * in the draft, so an accidental switch costs the teacher no work and `buildLiveQuestionPayload` is
 * what keeps the unused ones out of the lesson. True/false is the one kind that has to own its option
 * rows, because the server grades those two by their fixed `true` / `false` ids.
 */
export const changeLiveQuestionKind = (question, kind) => {
  const prepared = prepareLiveQuestion(question);
  const fresh = createLiveQuestion(kind);
  const options = kind === 'tf' || !prepared.options.length ? fresh.options : prepared.options;
  const kept = new Set(options.map((option) => option.id));
  return {
    ...prepared,
    kind,
    options,
    correctOptionId: isLiveOptionKind(kind) && !kept.has(prepared.correctOptionId)
      ? options[0]?.id || ''
      : prepared.correctOptionId,
    correctOptionIds: kind === 'multi_select'
      ? prepared.correctOptionIds.filter((id) => kept.has(id))
      : prepared.correctOptionIds,
    matchingPairs: prepared.matchingPairs.length ? prepared.matchingPairs : fresh.matchingPairs,
    orderingItems: prepared.orderingItems.length ? prepared.orderingItems : fresh.orderingItems,
    blanks: kind === 'fill_in_blank' ? blankRowsForPrompt(prepared.prompt, prepared.blanks) : prepared.blanks
  };
};

export const liveOptionLimit = { max: PRACTICE_MAX_OPTIONS, min: PRACTICE_MIN_OPTIONS };

export const addLiveOption = (question) => {
  const prepared = prepareLiveQuestion(question);
  if (prepared.options.length >= PRACTICE_MAX_OPTIONS) return prepared;
  const used = new Set(prepared.options.map((option) => option.id));
  const id = OPTION_ID_LABELS.find((label) => !used.has(label)) || `o${prepared.options.length + 1}`;
  return { ...prepared, options: [...prepared.options, { id, text: '' }] };
};

export const removeLiveOption = (question, optionId) => {
  const prepared = prepareLiveQuestion(question);
  if (prepared.options.length <= (prepared.kind === 'tf' ? 2 : PRACTICE_MIN_OPTIONS)) return prepared;
  const options = prepared.options.filter((option) => option.id !== optionId);
  return {
    ...prepared,
    options,
    correctOptionId: prepared.correctOptionId === optionId ? options[0]?.id || '' : prepared.correctOptionId,
    correctOptionIds: prepared.correctOptionIds.filter((id) => id !== optionId)
  };
};

export const toggleLiveCorrectOption = (question, optionId) => {
  const prepared = prepareLiveQuestion(question);
  const chosen = prepared.correctOptionIds.includes(optionId)
    ? prepared.correctOptionIds.filter((id) => id !== optionId)
    : [...prepared.correctOptionIds, optionId];
  return { ...prepared, correctOptionIds: chosen };
};

export const livePairLimit = { min: PRACTICE_MIN_PAIRS };

export const addLiveMatchingPair = (question) => {
  const prepared = prepareLiveQuestion(question);
  return { ...prepared, matchingPairs: [...prepared.matchingPairs, { left: '', right: '' }] };
};

export const removeLiveMatchingPair = (question, index) => {
  const prepared = prepareLiveQuestion(question);
  if (prepared.matchingPairs.length <= PRACTICE_MIN_PAIRS) return prepared;
  return { ...prepared, matchingPairs: prepared.matchingPairs.filter((_, i) => i !== index) };
};

export const liveStepLimit = { min: PRACTICE_MIN_ORDER_ITEMS, max: PRACTICE_MAX_ORDER_ITEMS };

export const addLiveOrderingItem = (question) => {
  const prepared = prepareLiveQuestion(question);
  if (prepared.orderingItems.length >= PRACTICE_MAX_ORDER_ITEMS) return prepared;
  return { ...prepared, orderingItems: [...prepared.orderingItems, { id: '', text: '' }] };
};

export const removeLiveOrderingItem = (question, index) => {
  const prepared = prepareLiveQuestion(question);
  if (prepared.orderingItems.length <= PRACTICE_MIN_ORDER_ITEMS) return prepared;
  return { ...prepared, orderingItems: prepared.orderingItems.filter((_, i) => i !== index) };
};

export const liveNumericModes = ['exact', 'tolerance', 'relative', 'range'];

export const patchLiveNumericRule = (question, change) => {
  const prepared = prepareLiveQuestion(question);
  return { ...prepared, numericRule: { ...blankNumericRule(), ...(prepared.numericRule || {}), ...change } };
};

/** The question text owns the blanks, so a row can never outlive the blank it answers. */
export const liveBlankIds = (prompt = '') => {
  const ids = [];
  const pattern = /\{\{\s*(?:blank:)?\s*([A-Za-z0-9_-]+)\s*\}\}/g;
  let match = pattern.exec(String(prompt ?? ''));
  while (match) {
    if (!ids.includes(match[1])) ids.push(match[1]);
    match = pattern.exec(String(prompt ?? ''));
  }
  return ids;
};

export const syncLiveQuestionBlanks = (question) => {
  const prepared = prepareLiveQuestion({ ...question, kind: 'fill_in_blank' });
  return { ...prepared, blanks: blankRowsForPrompt(prepared.prompt, prepared.blanks) };
};

/** The text owns the blanks, so a row can never outlive the token it answers. */
const blankRowsForPrompt = (prompt, blanks = []) =>
  liveBlankIds(prompt).map((id) => ({
    id,
    acceptsText: blanks.find((blank) => blank.id === id)?.acceptsText || ''
  }));

export const liveOrderingLimit = { min: PRACTICE_MIN_ORDER_ITEMS, max: PRACTICE_MAX_ORDER_ITEMS };

export const moveLiveOrderingItem = (items = [], index, delta) => {
  const target = index + delta;
  if (index < 0 || target < 0 || index >= items.length || target >= items.length) return items;
  const next = items.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

/** A level starts as a copy of the shared question so the teacher edits a difference, not a blank. */
export const createLiveVariantQuestion = (question) => {
  const prepared = prepareLiveQuestion(question);
  return JSON.parse(JSON.stringify(prepared));
};

/**
 * A CSV names its levels in the teacher's own words, while lesson JSON names them by the id the class
 * gave them. Once that class's groups are known, a level whose name matches one of them adopts its id
 * instead of being silently dropped, and only genuinely unknown names stay unlinked.
 */
export const linkLiveLessonLevels = (slides = [], groups = []) => {
  const idByName = new Map(
    groups.map((group) => [String(group?.name || '').trim().toLowerCase(), String(group?._id || '')]),
  );
  let linked = false;
  const next = slides.map((slide) => ({
    ...slide,
    variants: (slide?.variants || []).map((variant) => {
      if (variant?.groupId || !variant?.group) return variant;
      const groupId = idByName.get(String(variant.group).trim().toLowerCase());
      if (!groupId) return variant;
      linked = true;
      return { ...variant, groupId };
    }),
  }));
  return linked ? next : slides;
};

/**
 * The editor keeps a blank's accepted wordings as one string, so it is folded back into the
 * `accepts` list the server grades with, and nothing the kind does not use is sent along.
 */
export const buildLiveQuestionPayload = (question) => {
  const prepared = prepareLiveQuestion(question);
  const kind = prepared.kind;
  const options = isLiveOptionKind(kind)
    ? prepared.options
      .map((option) => ({ id: option.id, text: text(option.text) }))
      .filter((option) => option.text)
    : [];
  const kept = new Set(options.map((option) => option.id));
  const payload = {
    kind,
    prompt: prepared.prompt,
    explanation: prepared.explanation,
    options,
    correctOptionId: isLiveChoiceKind(kind) && kept.has(prepared.correctOptionId)
      ? prepared.correctOptionId
      : '',
    correctOptionIds: kind === 'multi_select'
      ? prepared.correctOptionIds.filter((id) => kept.has(id))
      : [],
    matchingPairs: kind === 'matching'
      ? prepared.matchingPairs.map((pair) => ({ left: text(pair.left), right: text(pair.right) }))
      : [],
    orderingItems: kind === 'ordering'
      ? prepared.orderingItems
        .map((item) => ({ id: item.id, text: text(item.text) }))
        .filter((item) => item.text)
      : [],
    blanks: kind === 'fill_in_blank'
      ? blankRowsForPrompt(prepared.prompt, prepared.blanks)
        .map((blank) => ({
          id: blank.id,
          accepts: text(blank.acceptsText)
            .split(PRACTICE_VARIANT_SEPARATOR)
            .map(text)
            .filter(Boolean)
        }))
        .filter((blank) => blank.accepts.length)
      : [],
    numericRule: kind === 'numeric'
      ? {
        ...prepared.numericRule,
        mode: ['exact', 'tolerance', 'relative', 'range'].includes(prepared.numericRule.mode)
          ? prepared.numericRule.mode
          : 'exact'
      }
      : undefined,
    guidance: kind === 'text' ? prepared.guidance : '',
    criteria: kind === 'text' ? prepared.criteria : '',
    minWords: kind === 'text' ? prepared.minWords : 0,
    maxWords: kind === 'text' ? prepared.maxWords : 0
  };
  return payload;
};
