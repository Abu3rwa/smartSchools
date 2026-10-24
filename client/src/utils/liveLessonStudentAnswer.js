import { isLiveWrittenKind, liveQuestionKind } from '../constants/liveLessonQuestionKinds.js';
import {
  describeStudentAnswer,
  getBlankIds,
  getOrderingItems,
  readBlankAnswers,
  readOrderingOrder
} from './mapPracticeObjectiveAnswers.js';
import { getMatchingColumns } from './mapPracticeMatching.js';

const text = (value) => String(value ?? '').trim();

// The shared answer inputs and graders read the practice vocabulary, so a live kind is named in
// practice words on the way in.
const PRACTICE_TYPE_BY_LIVE_KIND = {
  mcq: 'multiple_choice',
  tf: 'true_false',
  multi_select: 'multiple_select',
  matching: 'matching',
  ordering: 'ordering',
  fill_in_blank: 'fill_in_blank',
  numeric: 'numeric_response',
  text: 'short_answer'
};

/**
 * A live student payload already carries the presentation the server prepared for this group
 * (shuffled choices and steps, blank ids, a numeric hint). Only the practice names the shared
 * inputs read are missing, plus the letter a multi-select answer is keyed by.
 */
export const liveAnswerQuestion = (question = {}) => ({
  ...question,
  kind: liveQuestionKind(question),
  questionType: PRACTICE_TYPE_BY_LIVE_KIND[liveQuestionKind(question)] || question.kind,
  stem: text(question.prompt),
  options: (Array.isArray(question.options) ? question.options : [])
    .map((option, index) => ({
      id: text(option?.id),
      label: text(option?.id).toUpperCase() || String.fromCharCode(65 + index),
      text: text(option?.text)
    }))
    .filter((option) => option.text)
});

/** The student picks letters; the session stores the ids the question was authored with. */
export const liveSelectedOptionIds = (question, labels = []) => {
  const chosen = new Set((Array.isArray(labels) ? labels : [labels]).map(text));
  return liveAnswerQuestion(question)
    .options
    .filter((option) => chosen.has(option.label))
    .map((option) => option.id);
};

/** A stored answer reads back into the value the kind's input edits, so a submission stays on screen. */
export const liveAnswerDraft = (question, answer = {}) => {
  const kind = question?.kind;
  if (kind === 'mcq' || kind === 'tf') return text(answer?.selectedOptionId);
  const response = answer?.response ?? answer?.text;
  if (kind === 'multi_select') {
    const ids = new Set((Array.isArray(response) ? response : [response]).map(text));
    return liveAnswerQuestion(question).options.filter((option) => ids.has(option.id)).map((option) => option.label);
  }
  if (kind === 'numeric' || isLiveWrittenKind(kind)) return text(response);
  return Array.isArray(response) ? response : [];
};

export const countLiveAnswerWords = (value) => text(value).split(/\s+/).filter(Boolean).length;

/**
 * One filled row is enough for the part-credit kinds, exactly as in practice; an order only counts
 * once every step is placed, because a half-ordered list has no defensible mark.
 */
export const isLiveAnswerReady = (question, draft) => {
  const kind = question?.kind;
  if (!kind) return false;
  if (kind === 'mcq' || kind === 'tf') return Boolean(text(draft));
  if (kind === 'multi_select') return Boolean(liveSelectedOptionIds(question, draft).length);
  if (kind === 'numeric' || isLiveWrittenKind(kind)) return Boolean(text(draft));
  if (kind === 'matching') {
    const terms = getMatchingColumns(liveAnswerQuestion(question)).terms;
    return Boolean(terms.length) && (Array.isArray(draft) ? draft : [])
      .some((row) => text(row?.left) && text(row?.right));
  }
  if (kind === 'ordering') {
    const items = getOrderingItems(question).length;
    return Boolean(items) && readOrderingOrder(draft).length === items;
  }
  if (kind === 'fill_in_blank') {
    const ids = getBlankIds(liveAnswerQuestion(question));
    return Boolean(ids.length) && readBlankAnswers(draft).size > 0;
  }
  return false;
};

/** The field names the live socket grades per kind; nothing else leaves the browser. */
export const buildLiveAnswerPayload = (question, draft) => {
  const kind = question?.kind;
  if (kind === 'mcq' || kind === 'tf') return { selectedOptionId: text(draft).slice(0, 20) };
  if (kind === 'multi_select') return { response: liveSelectedOptionIds(question, draft) };
  if (kind === 'numeric') return { response: text(draft).slice(0, 40) };
  if (isLiveWrittenKind(kind)) return { response: text(draft).slice(0, 4000) };
  return { response: Array.isArray(draft) ? draft : [] };
};

/** Teachers and students read an answer as words, never as the ids or terms behind them. */
export const describeLiveStudentAnswer = (question, answer = {}) => {
  const kind = question?.kind;
  if (kind === 'mcq' || kind === 'tf') {
    const chosen = liveAnswerQuestion(question).options
      .find((option) => option.id === text(answer.selectedOptionId));
    return chosen ? `${chosen.label}. ${chosen.text}` : '';
  }
  const response = answer.response ?? answer.text;
  if (kind === 'multi_select') {
    const byId = new Map(liveAnswerQuestion(question).options.map((option) => [option.id, option]));
    const ids = Array.isArray(response) ? response : [response];
    return ids.map((id) => byId.get(text(id))?.label).filter(Boolean).join(', ');
  }
  if (kind === 'matching') {
    return (Array.isArray(response) ? response : [])
      .filter((row) => text(row?.left))
      .map((row) => `${text(row.left)} = ${text(row.right) || '—'}`)
      .join('; ');
  }
  return describeStudentAn