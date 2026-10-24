import { resolvePracticeQuestionType } from '../../constants/practiceQuestionTypes.js';
import { normalizeShortText } from '../../validators/mapPracticeValidators.js';
import {
  decodeOrderingResponse,
  decodeResponseMap,
  encodeOrderingKey,
  gradeNumericAgainstRule
} from './answerFormat.js';
import { rationalToText } from './numericAnswer.js';

const REVIEW = (reason) => ({
  isCorrect: null,
  score: 0,
  requiresTeacherReview: true,
  reviewReason: reason,
  feedback: 'Your answer is waiting for your teacher to review it.'
});

const UNANSWERED = 'unanswered';

const toKeySet = (value) => Array.from(new Set(
  (Array.isArray(value) ? value : String(value ?? '').split('|'))
    .map((entry) => String(entry ?? '').trim().toUpperCase())
    .filter(Boolean)
));

const roundScore = (value) => Number(Math.max(0, Math.min(1, value)).toFixed(4));

export const gradeMultipleSelect = ({ studentAnswer, correctAnswer, partialCredit = false }) => {
  const student = toKeySet(studentAnswer);
  const expected = toKeySet(correctAnswer);
  if (!student.length || !expected.length) return REVIEW(UNANSWERED);

  const expectedSet = new Set(expected);
  const studentSet = new Set(student);
  const matched = expected.filter((key) => studentSet.has(key)).length;
  const incorrect = student.filter((key) => !expectedSet.has(key));
  const exact = student.length === expected.length && matched === expected.length;

  if (!partialCredit) {
    return {
      isCorrect: exact,
      score: exact ? 1 : 0,
      requiresTeacherReview: false,
      feedback: exact ? 'Your answer is correct.' : 'Your answer is not correct.',
      detail: { type: 'multiple_select', keys: expected, matched, total: expected.length, missing: expected.filter((key) => !studentSet.has(key)), incorrect }
    };
  }

  const score = roundScore(matched / expected.length);
  return {
    isCorrect: score >= 1,
    score,
    requiresTeacherReview: false,
    feedback: score >= 1 ? 'Your answer is correct.' : `You selected ${matched} of ${expected.length} correct options.`,
    detail: { type: 'multiple_select', keys: expected, matched, total: expected.length, missing: expected.filter((key) => !studentSet.has(key)), incorrect }
  };
};

const toPairSelections = (studentAnswer) => {
  if (Array.isArray(studentAnswer)) {
    return new Map(studentAnswer
      .filter((entry) => entry && typeof entry === 'object' && entry.left)
      .map((entry) => [normalizeShortText(entry.left), String(entry.right ?? '').trim()]));
  }
  if (studentAnswer && typeof studentAnswer === 'object') {
    return new Map(Object.entries(studentAnswer).map(([left, right]) => [normalizeShortText(left), String(right ?? '').trim()]));
  }
  const selections = new Map();
  String(studentAnswer ?? '').split('|').forEach((chunk) => {
    const index = chunk.indexOf('::');
    if (index === -1) return;
    const left = chunk.slice(0, index).trim();
    const right = chunk.slice(index + 2).trim();
    if (left) selections.set(normalizeShortText(left), right);
  });
  return selections;
};

export const gradeMatching = ({ studentAnswer, matchingPairs = [] }) => {
  const pairs = matchingPairs
    .map((pair) => ({ left: String(pair?.left ?? '').trim(), right: String(pair?.right ?? '').trim() }))
    .filter((pair) => pair.left && pair.right);
  if (!pairs.length) return REVIEW('no_pairs');

  const selections = toPairSelections(studentAnswer);
  const answered = pairs.filter((pair) => selections.get(normalizeShortText(pair.left))).length;
  if (!answered) return REVIEW(UNANSWERED);

  const detail = pairs.map((pair) => {
    const chosen = selections.get(normalizeShortText(pair.left)) || '';
    return { left: pair.left, expected: pair.right, chosen, matched: Boolean(chosen) && normalizeShortText(chosen) === normalizeShortText(pair.right) };
  });
  const matched = detail.filter((entry) => entry.matched).length;
  const score = roundScore(matched / pairs.length);

  return {
    isCorrect: score >= 1,
    score,
    requiresTeacherReview: false,
    feedback: score >= 1 ? 'Your answer is correct.' : `You matched ${matched} of ${pairs.length} pairs.`,
    detail: { type: 'matching', pairs: detail, matched, total: pairs.length, unanswered: pairs.length - answered }
  };
};

export const gradeOrdering = ({ studentAnswer, orderingItems = [] }) => {
  const items = orderingItems
    .map((item, index) => ({ id: String(item?.id || `o${index + 1}`), text: String(item?.text ?? '').trim() }))
    .filter((item) => item.text);
  if (items.length < 2) return REVIEW('no_items');

  const expectedOrder = items.map((item) => item.id);
  const chosen = decodeOrderingResponse(studentAnswer);
  if (!chosen.length) return REVIEW(UNANSWERED);

  const byId = new Map(items.map((item) => [item.id, item]));
  const unknown = chosen.filter((id) => !byId.has(id));
  if (unknown.length || chosen.length !== items.length) return REVIEW('incomplete_order');

  const detail = chosen.map((id, index) => ({
    id,
    text: byId.get(id).text,
    position: index + 1,
    expectedPosition: expectedOrder.indexOf(id) + 1
  }));
  const matched = detail.filter((entry) => entry.position === entry.expectedPosition).length;
  const score = roundScore(matched / items.length);

  return {
    isCorrect: score >= 1,
    score,
    requiresTeacherReview: false,
    feedback: score >= 1 ? 'Your answer is correct.' : `You placed ${matched} of ${items.length} items correctly.`,
    detail: { type: 'ordering', order: detail, correctOrder: expectedOrder, matched, total: items.length }
  };
};

const normalizeBlankAnswer = (value, { caseSensitive = false } = {}) => {
  const text = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (caseSensitive) return text.replace(/[.,!?;:]+$/g, '').trim();
  // Students answer in sentences: "the Nile" and "Nile." must both match the authored blank.
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const gradeFillInBlank = ({ studentAnswer, blanks = [] }) => {
  const definitions = blanks
    .map((blank, index) => ({
      id: String(blank?.id || `b${index + 1}`),
      accepts: (Array.isArray(blank?.accepts) ? blank.accepts : [blank?.accepts]).map((entry) => String(entry ?? '').trim()).filter(Boolean),
      caseSensitive: Boolean(blank?.caseSensitive)
    }))
    .filter((blank) => blank.accepts.length);
  if (!definitions.length) return REVIEW('no_blanks');

  const responses = decodeResponseMap(studentAnswer);
  const answered = definitions.filter((blank) => String(responses[blank.id] ?? '').trim()).length;
  if (!answered) return REVIEW(UNANSWERED);

  const detail = definitions.map((blank) => {
    const given = String(responses[blank.id] ?? '').trim();
    const matched = Boolean(given) && blank.accepts.some((accept) => (
      normalizeBlankAnswer(given, blank) === normalizeBlankAnswer(accept, blank)
    ));
    return { id: blank.id, given, accepts: blank.accepts, matched };
  });
  const matched = detail.filter((entry) => entry.matched).length;
  const score = roundScore(matched / definitions.length);

  return {
    isCorrect: score >= 1,
    score,
    requiresTeacherReview: false,
    feedback: score >= 1 ? 'Your answer is correct.' : `You filled ${matched} of ${definitions.length} blanks correctly.`,
    detail: { type: 'fill_in_blank', blanks: detail, matched, total: definitions.length }
  };
};

export const gradeNumericResponse = ({ studentAnswer, rule }) => {
  const raw = String(studentAnswer ?? '').trim();
  if (!raw) return REVIEW(UNANSWERED);

  const result = gradeNumericAgainstRule(raw, rule || {});
  if (result.reason === 'invalid_rule') return REVIEW('invalid_rule');

  const display = rule?.mode === 'range'
    ? `${rule.min} to ${rule.max}${rule.unit ? ` ${rule.unit}` : ''}`
    : `${rule?.value ?? ''}${rule?.tolerance ? ` ± ${rule.tolerance}${rule.mode === 'relative' ? '%' : ''}` : ''}${rule?.unit ? ` ${rule.unit}` : ''}`;

  return {
    isCorrect: Boolean(result.matched),
    score: result.matched ? 1 : 0,
    requiresTeacherReview: false,
    feedback: result.matched
      ? 'Your answer is correct.'
      : (result.reason === 'missing_unit' || result.reason === 'wrong_unit' || result.reason === 'unexpected_unit'
        ? 'Check the unit in your answer.'
        : 'Your answer is not correct.'),
    detail: {
      type: 'numeric',
      display,
      parsed: result.value ? rationalToText(result.value) : null,
      reason: result.reason,
      givenUnit: result.unit || ''
    }
  };
};

export const gradeObjectiveAnswer = ({ questionType, ...payload }) => {
  const resolved = resolvePracticeQuestionType(questionType);
  if (resolved === 'multiple_select') return gradeMultipleSelect(payload);
  if (resolved === 'matching') return gradeMatching(payload);
  if (resolved === 'ordering') return gradeOrdering({ ...payload, orderingItems: payload.orderingItems || payload.items });
  if (resolved === 'fill_in_blank') return gradeFillInBlank(payload);
  if (resolved === 'numeric_response') {
    return gradeNumericResponse({
      ...payload,
      rule: payload.rule || payload.numericRule
    });
  }
  return null;
};

export const buildObjectiveAnswerKey = ({ questionType, correctAnswer, options, matchingPairs, orderingItems, blanks, numericRule }) => {
  const resolved = resolvePracticeQuestionType(questionType);
  if (resolved === 'multiple_select') return toKeySet(correctAnswer).join('|');
  if (resolved === 'matching') return (matchingPairs || []).map((pair) => `${pair.left}::${pair.right}`).join('|');
  if (resolved === 'ordering') return encodeOrderingKey(orderingItems || []);
  if (resolved === 'fill_in_blank') return (blanks || []).map((blank) => `${blank.id}::${(blank.accepts || []).join('~')}`).join('|');
  if (resolved === 'numeric_response') return numericRule ? JSON.stringify(numericRule) : String(correctAnswer ?? '');
  void options;
  return String(correctAnswer ?? '');
};
