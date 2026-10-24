import { buildPassageSnapshot } from './assessment/passageService.js';
import {
  buildBlankIds,
  buildMatchingColumns,
  buildNumericHint,
  buildOrderingItems,
  buildStudentPresentationFields,
} from './assessment/studentPresentationService.js';

const presentationSeed = (question) => `${question?._id}|${question?.student}`;

export const buildMapPracticeMatchingColumns = (question) => buildMatchingColumns(question, presentationSeed(question));

const STUDENT_HIDDEN_QUESTION_FIELDS = [
  'correctAnswer',
  'explanation',
  'distractorNote',
  'matchingPairs',
  'blanks',
  'numericRule'
];

const STUDENT_HIDDEN_ANSWER_FIELDS = [
  'correctAnswerSnapshot',
  'explanationSnapshot',
  'matchingPairsSnapshot',
  'blanksSnapshot',
  'numericRuleSnapshot',
  'orderingKeySnapshot',
  'gradingDetail'
];

/**
 * The authored order is the key, so students get the same shuffled list every time for one
 * question and a different shuffle for another student.
 */
export const buildMapPracticeOrderingItems = (question) => buildOrderingItems(question, presentationSeed(question));

export const buildMapPracticeBlankFields = (question) => buildBlankIds(question);

export const buildMapPracticeNumericHint = (question) => buildNumericHint(question);

export const buildMapPracticeStudentFields = (question) => (
  buildStudentPresentationFields(question, presentationSeed(question))
);

export const buildMapPracticePassageSnapshot = (question) => buildPassageSnapshot({
  _id: question?.passage?._id ?? question?.passage ?? null,
  passageKey: String(question?.passageId || question?.passage?.passageKey || ''),
  title: String(question?.passageTitle || question?.passage?.title || ''),
  text: String(question?.passage?.text || question?.passageText || ''),
  source: String(question?.passage?.source || ''),
  language: String(question?.passage?.language || ''),
  accessibilityText: String(question?.passage?.accessibilityText || ''),
  contentHash: question?.passage?.contentHash || ''
});

export const hideMapPracticeQuestionAnswers = (question) => {
  const safe = Object.fromEntries(Object.entries(question).filter(([key]) =>
    !STUDENT_HIDDEN_QUESTION_FIELDS.includes(key)
  ));

  return { ...safe, ...buildMapPracticeStudentFields(question) };
};

export const hideMapPracticeAttemptAnswerKeys = (attempt) => ({
  ...attempt,
  answers: (attempt.answers || []).map((answer) => {
    const safe = Object.fromEntries(Object.entries(answer).filter(([key]) =>
      !STUDENT_HIDDEN_ANSWER_FIELDS.includes(key)
    ));
    if (!safe.questionSnapshot) return safe;
    // Snapshots only ever store the shuffled columns, never the term-to-definition mapping.
    safe.questionSnapshot = Object.fromEntries(
      Object.entries(safe.questionSnapshot)
        .filter(([key]) => !['matchingPairs', 'blanks', 'numericRule'].includes(key))
    );
    return safe;
  }),
});

export const applyMapPracticeReviewMarks = (answers, requestedAnswers) => {
  const requestedById = new Map(requestedAnswers.map((item) => [String(item.answerId), item]));
  const nextAnswers = answers.map((answer) => {
    const answerId = String(answer._id);
    const override = requestedById.get(answerId);
    if (!override) return answer;
    requestedById.delete(answerId);
    const changed = answer.isCorrect !== override.isCorrect;
    const score = changed
      ? override.isCorrect === true ? 1 : 0
      : Number(answer.score) || (answer.isCorrect === true ? 1 : 0);
    return {
      ...answer,
      isCorrect: override.isCorrect,
      score,
      teacherOverride: Boolean(answer.teacherOverride || changed),
      teacherComment: typeof override.teacherComment === 'string'
        ? override.teacherComment.trim()
        : answer.teacherComment || '',
    };
  });

  if (requestedById.size > 0) {
    return { error: 'One or more answers do not belong to this attempt.' };
  }

  const score = nextAnswers.reduce((total, answer) => total + (Number(answer.score) || 0), 0);
  const maxScore = nextAnswers.length;
  const isReviewed = nextAnswers.length > 0 && nextAnswers.every((answer) => answer.isCorrect === true || answer.isCorrect === false);

  return {
    answers: nextAnswers,
    score,
    maxScore,
    reviewStatus: isReviewed ? 'reviewed' : 'pending',
    status: isReviewed ? 'reviewed' : 'submitted',
  };
};
