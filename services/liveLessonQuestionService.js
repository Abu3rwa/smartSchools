import {
  isLiveObjectiveKind,
  isLiveWrittenKind,
  LIVE_QUESTION_KINDS,
  liveQuestionKind,
} from "../constants/liveLessonQuestionKinds.js";
import {
  PRACTICE_MAX_OPTIONS,
  PRACTICE_MAX_ORDER_ITEMS,
  PRACTICE_MIN_OPTIONS,
  PRACTICE_MIN_ORDER_ITEMS,
  PRACTICE_MIN_PAIRS,
  PRACTICE_ORDER_SEPARATOR,
  resolvePracticeQuestionType,
} from "../constants/practiceQuestionTypes.js";
import { createOrderingItems, findBlankTokens } from "./assessment/answerFormat.js";
import { gradeObjectiveAnswer } from "./assessment/objectiveGrading.js";
import { hideTeacherOnlyFields } from "./assessment/studentPresentationService.js";
import { parseNumericValue } from "./assessment/numericAnswer.js";
import { normalizeShortText } from "../validators/mapPracticeValidators.js";

const text = (value) => String(value ?? "").trim();

const toKeyList = (value) => (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);

/**
 * Live lessons kept their own short kind tokens, so every call into the shared practice engines
 * goes through this adapter: the engines read `questionType` and `stem`.
 */
export const toPracticeQuestionShape = (question) => ({
  kind: liveQuestionKind(question),
  questionType: resolvePracticeQuestionType(liveQuestionKind(question)),
  prompt: text(question?.prompt),
  stem: text(question?.prompt),
  options: (Array.isArray(question?.options) ? question.options : []).map((option) => ({
    id: text(option?.id),
    text: text(option?.text),
  })),
  correctOptionId: text(question?.correctOptionId),
  correctOptionIds: toKeyList(question?.correctOptionIds),
  matchingPairs: (Array.isArray(question?.matchingPairs) ? question.matchingPairs : []).map((pair) => ({
    left: text(pair?.left),
    right: text(pair?.right),
  })),
  orderingItems: (Array.isArray(question?.orderingItems) ? question.orderingItems : []).map((item) => ({
    id: text(item?.id),
    text: text(item?.text),
  })),
  blanks: (Array.isArray(question?.blanks) ? question.blanks : []).map((blank) => ({
    id: text(blank?.id),
    accepts: toKeyList(blank?.accepts),
  })),
  numericRule: question?.numericRule || null,
  explanation: text(question?.explanation),
  guidance: text(question?.guidance),
  criteria: text(question?.criteria),
  minWords: Number(question?.minWords) || 0,
  maxWords: Number(question?.maxWords) || 0,
});

/**
 * Item and blank ids are authored once here so the editor and the CSV never have to invent them,
 * and so a re-saved lesson cannot leave a student answer naming an id that no longer exists.
 * The result keeps the live question shape: only fields the lesson schema stores.
 */
export const normalizeLiveQuestion = (question, { salt = "" } = {}) => {
  if (!question) return question;
  const shape = toPracticeQuestionShape(question);
  const normalized = {
    kind: shape.kind,
    prompt: shape.prompt,
    options: shape.options,
    correctOptionId: shape.correctOptionId,
    correctOptionIds: shape.correctOptionIds,
    matchingPairs: shape.matchingPairs,
    orderingItems: shape.orderingItems,
    blanks: shape.blanks,
    numericRule: shape.numericRule || undefined,
    guidance: shape.guidance,
    criteria: shape.criteria,
    minWords: shape.minWords,
    maxWords: shape.maxWords,
    explanation: shape.explanation,
  };

  if (shape.kind === "ordering") {
    const ids = new Set();
    normalized.orderingItems = shape.orderingItems.map((item, index) => {
      if (item.id && !ids.has(item.id)) {
        ids.add(item.id);
        return item;
      }
      const generated = createOrderingItems([item.text || `item ${index + 1}`], { salt: `${salt}|${index}` })[0];
      ids.add(generated.id);
      return { ...item, id: generated.id };
    });
  }

  if (shape.kind === "fill_in_blank") {
    const tokenIds = findBlankTokens(shape.prompt);
    const used = new Set();
    normalized.blanks = shape.blanks
      .map((blank, index) => {
        const id = blank.id || tokenIds[index] || `b${index + 1}`;
        if (!blank.accepts.length || used.has(id)) return null;
        used.add(id);
        return { id, accepts: blank.accepts };
      })
      .filter(Boolean);
  }

  if (shape.kind === "numeric" && normalized.numericRule) {
    const rule = normalized.numericRule;
    normalized.numericRule = {
      mode: ["exact", "tolerance", "relative", "range"].includes(rule.mode) ? rule.mode : "exact",
      value: text(rule.value),
      min: text(rule.min),
      max: text(rule.max),
      tolerance: text(rule.tolerance),
      unit: text(rule.unit),
      decimalPlaces: text(rule.decimalPlaces),
      allowFractions: Boolean(rule.allowFractions),
      allowPercent: Boolean(rule.allowPercent),
    };
  }

  return normalized;
};

const optionErrors = (question, { allowMultiple }) => {
  const errors = [];
  const options = question.options;
  const ids = options.map((option) => option.id);
  if (question.kind === "tf") {
    if (options.length !== 2 || !ids.includes("true") || !ids.includes("false")) {
      errors.push({ field: "options", message: "True/false questions need exactly a True and a False option." });
    }
  } else if (options.length < PRACTICE_MIN_OPTIONS || options.length > PRACTICE_MAX_OPTIONS) {
    errors.push({ field: "options", message: `Answer options must number ${PRACTICE_MIN_OPTIONS}–${PRACTICE_MAX_OPTIONS}.` });
  }
  if (new Set(ids).size !== ids.length || options.some((option) => !option.text)) {
    errors.push({ field: "options", message: "Answer options need unique IDs and non-empty text." });
  }
  if (options.some((option) => option.id.length > 20 || option.text.length > 300)) {
    errors.push({ field: "options", message: "Option IDs are limited to 20 characters and option text to 300." });
  }
  const answers = allowMultiple ? question.correctOptionIds : [question.correctOptionId];
  if (!answers.length) {
    errors.push({ field: "correct answer", message: allowMultiple ? "Choose at least two correct options." : "Choose the correct answer." });
  } else if (allowMultiple && answers.length < 2) {
    errors.push({ field: "correct answer", message: "A multiple-answer question needs at least two correct options." });
  }
  if (answers.some((answer) => !ids.includes(answer))) {
    errors.push({ field: "correct answer", message: "Every correct answer must match an option." });
  }
  return errors;
};

const numericRuleErrors = (rule) => {
  if (!rule) return [{ field: "numeric answer", message: "A numeric question needs the expected value or range." }];
  const number = (value) => Boolean(value) && Boolean(parseNumericValue(value, { allowFractions: true }));
  if (rule.mode === "range") {
    if (!number(rule.min) || !number(rule.max)) return [{ field: "numeric answer", message: "A range needs a readable low and high value." }];
    return [];
  }
  if (!number(rule.value)) return [{ field: "numeric answer", message: "A numeric question needs a readable expected value." }];
  // A tolerance mode without a tolerance would silently grade as an exact match, so it is refused here.
  if ((rule.mode === "tolerance" || rule.mode === "relative") && !number(rule.tolerance)) {
    return [{ field: "tolerance", message: `${rule.mode === "relative" ? "A percentage" : "A"} tolerance needs a readable value.` }];
  }
  return [];
};

/** Every authoring surface (editor save, CSV import) funnels question objects through this. */
export const validateLiveQuestion = (question, { fieldName = "question" } = {}) => {
  const errors = [];
  const kind = text(question?.kind);
  if (!LIVE_QUESTION_KINDS.includes(kind)) {
    return [{ field: fieldName, message: `Question types available are ${LIVE_QUESTION_KINDS.join(", ")}.` }];
  }
  const shape = normalizeLiveQuestion(question, { salt: fieldName });
  const prompt = shape.prompt;
  if (!prompt) errors.push({ field: "prompt", message: "Question slides need a prompt." });
  if (prompt.length > 500) errors.push({ field: "prompt", message: "Question prompts are limited to 500 characters." });
  if (shape.explanation.length > 2000) errors.push({ field: "explanation", message: "Explanations are limited to 2,000 characters." });
  if (shape.guidance.length > 500) errors.push({ field: "guidance", message: "Guidance is limited to 500 characters." });
  if (shape.criteria.length > 1000) errors.push({ field: "criteria", message: "Marking criteria are limited to 1,000 characters." });
  if (shape.minWords > 2000 || shape.maxWords > 2000) {
    errors.push({ field: "word limit", message: "Word limits are 2,000 or fewer." });
  } else if (shape.maxWords && shape.minWords > shape.maxWords) {
    errors.push({ field: "word limit", message: "The minimum word count cannot be above the maximum." });
  }

  if (kind === "mcq" || kind === "tf") errors.push(...optionErrors(shape, { allowMultiple: false }));
  if (kind === "multi_select") errors.push(...optionErrors(shape, { allowMultiple: true }));

  if (kind === "matching") {
    const pairs = shape.matchingPairs;
    if (pairs.length < PRACTICE_MIN_PAIRS) {
      errors.push({ field: "matching pairs", message: `Matching needs at least ${PRACTICE_MIN_PAIRS} pairs.` });
    }
    if (pairs.some((pair) => !pair.left || !pair.right)) {
      errors.push({ field: "matching pairs", message: "Every matching pair needs a term and its match." });
    }
    if (pairs.some((pair) => pair.left.length > 300 || pair.right.length > 300)) {
      errors.push({ field: "matching pairs", message: "Matching terms are limited to 300 characters." });
    }
    if (new Set(pairs.map((pair) => pair.left)).size !== pairs.length) {
      errors.push({ field: "matching pairs", message: "Each matching term can only appear once." });
    }
  }

  if (kind === "ordering") {
    const items = shape.orderingItems;
    if (items.length < PRACTICE_MIN_ORDER_ITEMS || items.length > PRACTICE_MAX_ORDER_ITEMS) {
      errors.push({ field: "ordering items", message: `Ordering needs ${PRACTICE_MIN_ORDER_ITEMS}–${PRACTICE_MAX_ORDER_ITEMS} items.` });
    }
    if (items.some((item) => !item.text)) {
      errors.push({ field: "ordering items", message: "Every ordering item needs text." });
    }
    if (items.some((item) => item.text.length > 300)) {
      errors.push({ field: "ordering items", message: "Ordering items are limited to 300 characters." });
    }
  }

  if (kind === "fill_in_blank") {
    const tokenIds = findBlankTokens(prompt);
    if (!tokenIds.length) {
      errors.push({ field: "blanks", message: "Write each blank in the question text as {{b1}}." });
    }
    if (shape.blanks.length < tokenIds.length) {
      errors.push({ field: "blanks", message: `Every blank needs an accepted answer. Missing: ${tokenIds.filter((id) => !shape.blanks.some((blank) => blank.id === id)).join(", ")}` });
    } else if (shape.blanks.length > tokenIds.length) {
      errors.push({ field: "blanks", message: "The accepted answers name more blanks than the question text contains." });
    }
    // Equal counts are not enough: a key naming a token the text does not contain would be dropped
    // from the student's answer by id, grading a correct word as wrong.
    const orphanIds = shape.blanks.filter((blank) => !tokenIds.includes(blank.id)).map((blank) => blank.id);
    if (orphanIds.length) {
      errors.push({ field: "blanks", message: `The accepted answers name blanks the question text does not contain: ${orphanIds.join(", ")}.` });
    }
  }

  if (kind === "numeric") errors.push(...numericRuleErrors(shape.numericRule));

  return errors.map((error) => ({ ...error, field: `${fieldName} ${error.field}` }));
};

/** Students in a listed group answer the levelled variant; everyone else answers the shared question. */
export const resolveLiveQuestionForStudent = (slide, groupId) => {
  const variants = Array.isArray(slide?.variants) ? slide.variants : [];
  const match = groupId ? variants.find((variant) => String(variant.groupId) === String(groupId)) : null;
  return match?.question || slide?.question || null;
};

const HIDDEN_STUDENT_FIELDS = ["orderingItems", "correctOptionId", "correctOptionIds", "criteria"];

/** The shuffled columns, item order and blank ids a student may see; the key stays behind. */
export const buildLiveStudentQuestion = (question, seed = "") => {
  if (!question) return null;
  const shape = toPracticeQuestionShape(question);
  // `stem` and `questionType` are the practice engines' names for prompt and kind; the live client
  // reads `prompt` and `kind`, so the duplicates are dropped from the payload.
  const presentation = hideTeacherOnlyFields(shape, { seed, extraHiddenFields: HIDDEN_STUDENT_FIELDS });
  delete presentation.stem;
  delete presentation.questionType;
  return {
    ...presentation,
    kind: shape.kind,
    prompt: shape.prompt,
    options: shape.options,
    ...(shape.guidance ? { guidance: shape.guidance } : {}),
    ...(shape.minWords ? { minWords: shape.minWords } : {}),
    ...(shape.maxWords ? { maxWords: shape.maxWords } : {}),
  };
};

const bounded = (value, max) => text(value).slice(0, max);

/** Structured answers arrive either as `[{ left, right }]` / `[{ id, text }]` or as a plain map. */
const toRows = (value) => {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({ key: entry.left ?? entry.id ?? "", value: entry.right ?? entry.text ?? "" }));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, entry]) => ({
      key,
      value: entry && typeof entry === "object" ? (entry.right ?? entry.text ?? "") : entry,
    }));
  }
  return [];
};

/**
 * `LiveResponse.response` is a Mixed column, so every kind is reshaped here: only the ids and terms
 * the question actually offers are stored, and no socket can push an unbounded object into a document.
 */
export const sanitizeLiveAnswer = (question, data = {}) => {
  const kind = liveQuestionKind(question);
  if (isLiveWrittenKind(kind)) return { text: bounded(data.response ?? data.text, 4000) };
  if (kind === "mcq" || kind === "tf") return { selectedOptionId: bounded(data.selectedOptionId, 20) };
  if (kind === "multi_select") {
    const ids = new Set((Array.isArray(question.options) ? question.options : []).map((option) => text(option?.id)));
    return { response: toKeyList(data.response).filter((id) => ids.has(id)).slice(0, PRACTICE_MAX_OPTIONS) };
  }
  if (kind === "matching") {
    const termByNorm = new Map((Array.isArray(question.matchingPairs) ? question.matchingPairs : [])
      .map((pair) => [normalizeShortText(pair?.left), text(pair?.left)]));
    return {
      response: toRows(data.response)
        .map((row) => ({ left: termByNorm.get(normalizeShortText(row.key)) || "", right: bounded(row.value, 300) }))
        .filter((row) => row.left && row.right),
    };
  }
  if (kind === "ordering") {
    const ids = new Set((Array.isArray(question.orderingItems) ? question.orderingItems : [])
      .map((item) => text(item?.id)));
    return { response: toKeyList(data.response).filter((id) => ids.has(id)).slice(0, PRACTICE_MAX_ORDER_ITEMS) };
  }
  if (kind === "fill_in_blank") {
    const acceptedIds = new Set((Array.isArray(question.blanks) ? question.blanks : []).map((blank) => text(blank?.id)));
    return {
      response: toRows(data.response)
        .map((row) => ({ id: text(row.key), text: bounded(row.value, 300) }))
        .filter((row) => acceptedIds.has(row.id)),
    };
  }
  if (kind === "numeric") return { response: bounded(data.response ?? data.text, 40) };
  return { response: null };
};

const answerValue = (kind, { selectedOptionId, response }) => {
  if (kind === "mcq" || kind === "tf") return text(selectedOptionId);
  if (kind === "multi_select") return toKeyList(response);
  if (kind === "numeric") return text(response);
  return response;
};

/** A half-filled row is not an answer: only a chosen value counts. */
const countedRows = (kind, response) => {
  if (!Array.isArray(response)) return [];
  return response.filter((entry) => {
    if (!entry || typeof entry !== "object") return Boolean(text(entry));
    if (kind === "matching") return text(entry.left) && text(entry.right);
    if (kind === "fill_in_blank") return text(entry.id) && text(entry.text);
    return Boolean(text(entry.id ?? entry.value ?? entry.text));
  });
};

export const isLiveAnswerEmpty = (question, answer) => {
  const kind = liveQuestionKind(question);
  if (isLiveWrittenKind(kind)) return !text(answer?.text ?? answer?.response);
  if (Array.isArray(answer?.response)) return !countedRows(kind, answer.response).length;
  if (kind === "matching" || kind === "fill_in_blank" || kind === "ordering") return !text(answer?.response);
  return !answerValue(kind, answer);
};

/**
 * mcq and tf keep the original single-option compare; the five objective kinds reuse the practice
 * graders; a written answer is parked for the teacher, because nothing auto-marks prose here.
 */
export const gradeLiveAnswer = (question, answer) => {
  const kind = liveQuestionKind(question);

  if (isLiveWrittenKind(kind)) {
    return { isCorrect: null, score: null, status: "pending", feedback: "", detail: null };
  }

  if (kind === "mcq" || kind === "tf") {
    const selected = text(answer?.selectedOptionId);
    const ids = (Array.isArray(question.options) ? question.options : []).map((option) => text(option?.id));
    if (!selected || !ids.includes(selected)) {
      return { isCorrect: null, score: null, status: "pending", feedback: "", detail: null };
    }
    const isCorrect = selected === text(question.correctOptionId);
    return { isCorrect, score: isCorrect ? 1 : 0, status: "auto", feedback: "", detail: null };
  }

  if (!isLiveObjectiveKind(kind)) {
    return { isCorrect: null, score: null, status: "pending", feedback: "", detail: null };
  }

  const shape = toPracticeQuestionShape(question);
  const studentAnswer = answerValue(kind, answer);
  const graded = gradeObjectiveAnswer({
    questionType: kind,
    studentAnswer,
    correctAnswer: kind === "multi_select" ? shape.correctOptionIds.join("|") : undefined,
    options: shape.options,
    matchingPairs: shape.matchingPairs,
    orderingItems: shape.orderingItems,
    blanks: shape.blanks,
    numericRule: shape.numericRule,
  });

  if (!graded) return { isCorrect: null, score: null, status: "pending", feedback: "", detail: null };
  if (graded.isCorrect === null || graded.requiresTeacherReview) {
    return { isCorrect: null, score: null, status: "pending", feedback: graded.feedback || "", detail: graded.detail || null };
  }
  return {
    isCorrect: graded.isCorrect,
    score: graded.score,
    status: "auto",
    feedback: graded.feedback || "",
    detail: graded.detail || null,
  };
};

/** The answer key in the words the class would recognise, for the teacher's live view. */
export const describeLiveAnswerKey = (question) => {
  const shape = toPracticeQuestionShape(question);
  const optionText = (ids) => shape.options.filter((option) => ids.includes(option.id)).map((option) => option.text).join(", ");
  if (shape.kind === "mcq" || shape.kind === "tf") return optionText([shape.correctOptionId]);
  if (shape.kind === "multi_select") return optionText(shape.correctOptionIds);
  if (shape.kind === "matching") return shape.matchingPairs.map((pair) => `${pair.left} = ${pair.right}`).join("; ");
  if (shape.kind === "ordering") return shape.orderingItems.map((item) => item.text).join(` ${PRACTICE_ORDER_SEPARATOR} `);
  if (shape.kind === "fill_in_blank") return shape.blanks.map((blank) => `${blank.id}: ${blank.accepts.join(" / ")}`).join("; ");
  if (shape.kind === "numeric") {
    const rule = shape.numericRule || {};
    if (rule.mode === "range") return `${rule.min}–${rule.max}${rule.unit ? ` ${rule.unit}` : ""}`;
    return `${rule.value}${rule.tolerance ? ` ±${rule.tolerance}${rule.mode === "relative" ? "%" : ""}` : ""}${rule.unit ? ` ${rule.unit}` : ""}`;
  }
  return "";
};

export const buildLiveTeacherAnswer = (question) => {
  if (!question) return null;
  const shape = toPracticeQuestionShape(question);
  return {
    kind: shape.kind,
    correctOptionId: shape.correctOptionId,
    correctOptionIds: shape.correctOptionIds,
    answerText: describeLiveAnswerKey(shape),
    explanation: shape.explanation,
  };
};

/**
 * A stored answer in the words the class would recognise. The review page, the session PDF and the
 * released student feedback all quote the answer back with this, so a matching row never reads as
 * an object and an ordering answer never reads as a list of ids.
 */
export const describeLiveStudentAnswer = (question, answer = {}) => {
  const kind = liveQuestionKind(question);
  const optionText = (ids) => (Array.isArray(question?.options) ? question.options : [])
    .filter((option) => ids.includes(text(option?.id)))
    .map((option) => text(option.text) || text(option.id))
    .join(", ");
  if (kind === "mcq" || kind === "tf") {
    const selected = text(answer.selectedOptionId);
    return optionText([selected]) || selected;
  }
  if (kind === "multi_select") return optionText(toKeyList(answer.response));
  if (kind === "matching") {
    return countedRows(kind, answer.response).map((row) => `${row.left} = ${row.right}`).join("; ");
  }
  if (kind === "ordering") {
    const textById = new Map((Array.isArray(question.orderingItems) ? question.orderingItems : [])
      .map((item) => [text(item?.id), text(item?.text)]));
    return toKeyList(answer.response)
      .map((id) => textById.get(id) || id)
      .join(` ${PRACTICE_ORDER_SEPARATOR} `);
  }
  if (kind === "fill_in_blank") {
    return countedRows(kind, answer.response).map((row) => `${row.id}: ${row.text}`).join("; ");
  }
  if (kind === "numeric") return text(answer.response ?? answer.text);
  if (isLiveWrittenKind(kind)) return text(answer.text ?? answer.response);
  return "";
};
