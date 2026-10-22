import { normalizeShortText, normalizeAnswerList } from '../validators/mapPracticeValidators.js';

const toMatchingSelections = (studentAnswer) => {
  const entries = Array.isArray(studentAnswer)
    ? studentAnswer.filter((entry) => entry && typeof entry === 'object' && entry.left)
      .map((entry) => [entry.left, entry.right])
    : studentAnswer && typeof studentAnswer === 'object'
      ? Object.entries(studentAnswer)
      : [];

  // Responses are stored as [{ left, right }] so term text never becomes a Mongo document key.
  return new Map(entries.map(([left, right]) => [normalizeShortText(left), String(right ?? '').trim()]));
};

export const gradeMapPracticeQuestion = ({
  questionType,
  studentAnswer,
  correctAnswer,
  options = [],
  matchingPairs = [],
  partialCreditMultiSelect = false
}) => {
  const optionList = Array.isArray(options) ? options : [];
  const normalizeOption = (option) => String(option ?? '').trim().toUpperCase();

  if (questionType === 'mcq') {
    const rawStudent = normalizeOption(studentAnswer);
    const rawCorrect = normalizeOption(correctAnswer);
    if (!rawStudent || !rawCorrect) {
      return { isCorrect: null, requiresTeacherReview: true, score: 0, explanation: 'This question needs teacher review.' };
    }
    return {
      isCorrect: rawStudent === rawCorrect,
      requiresTeacherReview: false,
      score: rawStudent === rawCorrect ? 1 : 0,
      explanation: rawStudent === rawCorrect ? 'Correct.' : 'Not quite. Review the explanation and try again.'
    };
  }

  if (questionType === 'multi_select') {
    const studentSet = new Set(
      Array.isArray(studentAnswer)
        ? studentAnswer.map((value) => normalizeOption(value)).filter(Boolean)
        : String(studentAnswer ?? '').split('|').map((value) => normalizeOption(value)).filter(Boolean)
    );
    const correctSet = new Set(
      String(correctAnswer ?? '').split('|').map((value) => normalizeOption(value)).filter(Boolean)
    );
    const totalCorrect = correctSet.size;
    const matched = [...studentSet].filter((item) => correctSet.has(item)).length;
    if (studentSet.size === 0 || correctSet.size === 0) {
      return { isCorrect: null, requiresTeacherReview: true, score: 0, explanation: 'This question needs teacher review.' };
    }

    if (!partialCreditMultiSelect) {
      const isExact = studentSet.size === correctSet.size && [...studentSet].every((item) => correctSet.has(item));
      return {
        isCorrect: isExact,
        requiresTeacherReview: false,
        score: isExact ? 1 : 0,
        explanation: isExact ? 'Correct.' : 'Not quite. Review the explanation and try again.'
      };
    }

    const ratio = totalCorrect === 0 ? 0 : matched / totalCorrect;
    return {
      isCorrect: ratio >= 1,
      requiresTeacherReview: false,
      score: Number(Math.max(0, Math.min(1, ratio)).toFixed(2)),
      explanation: ratio >= 1 ? 'Correct.' : 'Partially correct. Review the explanation and try again.'
    };
  }

  if (questionType === 'short_text') {
    const accepted = normalizeAnswerList(correctAnswer);
    const normalStudent = normalizeShortText(studentAnswer);
    const anyMatch = accepted.some((answer) => normalizeShortText(answer) === normalStudent);

    if (!normalStudent) {
      return { isCorrect: null, requiresTeacherReview: true, score: 0, explanation: 'This answer needs teacher review.' };
    }

    if (anyMatch) {
      return { isCorrect: true, requiresTeacherReview: false, score: 1, explanation: 'Correct.' };
    }

    return { isCorrect: null, requiresTeacherReview: true, score: 0, explanation: 'This answer is waiting for teacher review.' };
  }

  if (questionType === 'matching') {
    const pairs = (Array.isArray(matchingPairs) ? matchingPairs : [])
      .map((pair) => ({ left: String(pair?.left ?? '').trim(), right: String(pair?.right ?? '').trim() }))
      .filter((pair) => pair.left && pair.right);
    if (!pairs.length) {
      return { isCorrect: null, requiresTeacherReview: true, score: 0, explanation: 'This question needs teacher review.' };
    }

    const selections = toMatchingSelections(studentAnswer);
    const picked = (pair) => selections.get(normalizeShortText(pair.left)) || '';
    const answered = pairs.filter((pair) => picked(pair)).length;
    if (answered === 0) {
      return { isCorrect: null, requiresTeacherReview: true, score: 0, explanation: 'This answer needs teacher review.' };
    }

    const matched = pairs.filter((pair) => normalizeShortText(picked(pair)) === normalizeShortText(pair.right)).length;
    const ratio = matched / pairs.length;

    return {
      isCorrect: ratio >= 1,
      requiresTeacherReview: false,
      score: Number(ratio.toFixed(2)),
      explanation: ratio >= 1
        ? 'Correct.'
        : `Matched ${matched} of ${pairs.length} pairs. Review the explanation and try again.`
    };
  }

  return { isCorrect: null, requiresTeacherReview: true, score: 0, explanation: 'This question needs teacher review.' };
};

export const gradeMapPracticeAttempt = ({ answers = [], partialCreditMultiSelect = false }) => {
  let score = 0;
  let maxScore = 0;
  const graded = answers.map((answer) => {
    const result = gradeMapPracticeQuestion({
      questionType: answer.questionType,
      studentAnswer: answer.response,
      correctAnswer: answer.correctAnswer,
      options: answer.options || [],
      matchingPairs: answer.matchingPairs || [],
      partialCreditMultiSelect
    });
    maxScore += 1;
    if (result.isCorrect === true || (Number.isFinite(result.score) && result.score > 0)) {
      score += result.score > 0 ? result.score : 1;
    }
    return {
      ...answer,
      isCorrect: result.isCorrect,
      score: Number.isFinite(result.score) ? result.score : 0,
      requiresTeacherReview: result.requiresTeacherReview,
      explanation: result.explanation,
      autoGraded: !result.requiresTeacherReview,
      teacherOverride: Boolean(answer.teacherOverride)
    };
  });

  return { score, maxScore, graded };
};
