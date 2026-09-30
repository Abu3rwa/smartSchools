import { normalizeShortText, normalizeAnswerList } from '../validators/mapPracticeValidators.js';

export const gradeMapPracticeQuestion = ({
  questionType,
  studentAnswer,
  correctAnswer,
  options = [],
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
