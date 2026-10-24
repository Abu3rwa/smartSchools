const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * How one submitted answer ended up. `pending` is the state slice 1 introduced: a written answer,
 * or an objective one the engine could not settle, waits here for the teacher and is never a wrong.
 */
export const liveAnswerState = (response) => {
  if (!response) return null;
  const marks = number(response.grade?.marks);
  const maxMarks = number(response.grade?.maxMarks);
  if (response.grade?.status === "graded" && marks !== null && maxMarks) {
    return marks >= maxMarks ? "correct" : marks > 0 ? "partial" : "wrong";
  }
  if (response.isCorrect === true) return "correct";
  if (response.isCorrect === false) {
    const score = number(response.score);
    return score && score > 0 ? "partial" : "wrong";
  }
  return "pending";
};

/**
 * The share of one question an answer earned, 0 to 1. Null means the answer has no verdict yet, so
 * the caller leaves it out of both sides of the divide instead of guessing a mark for it.
 */
export const liveAnswerCredit = (response) => {
  if (!response) return null;
  const state = liveAnswerState(response);
  if (state === "pending") return null;
  const marks = number(response.grade?.marks);
  const maxMarks = number(response.grade?.maxMarks);
  if (response.grade?.status === "graded" && marks !== null && maxMarks) return Math.min(1, marks / maxMarks);
  const score = number(response.score);
  if (score !== null) return Math.min(1, Math.max(0, score));
  return response.isCorrect ? 1 : 0;
};

/**
 * A session mark is earned credit over the questions that have a verdict: an objective answer scores
 * what the engine gave it, a marked written answer scores marks over its allocation, and a question
 * the student left when the teacher closed it scores zero and still counts. An answer that is still
 * waiting to be marked counts on neither side, so the teacher is never charged for their own queue.
 */
export const calculateLiveSessionMark = ({
  credits,
  maxMarks,
  visibilityIncidents,
  deductionPerIncident,
}) => {
  const verdicts = (credits || []).filter((credit) => credit !== null && credit !== undefined);
  const questionCount = verdicts.length;
  const earned = verdicts.reduce((total, credit) => total + Math.min(1, Math.max(0, Number(credit) || 0)), 0);
  const baseMarks = questionCount ? Number(((earned / questionCount) * Number(maxMarks)).toFixed(2)) : 0;
  const requestedDeduction = Number(((Number(visibilityIncidents) || 0) * (Number(deductionPerIncident) || 0)).toFixed(2));
  const behaviorDeduction = Math.min(baseMarks, requestedDeduction);
  return {
    baseMarks,
    behaviorDeduction,
    marks: Math.max(0, Number((baseMarks - behaviorDeduction).toFixed(2))),
    countedQuestions: questionCount,
    pendingQuestions: (credits || []).length - questionCount,
  };
};
