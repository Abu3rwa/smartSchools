export const studentFullName = (student) =>
  [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim() || '—';

export const answerForQuestion = (responses, questionId) => {
  const match = (responses || []).find((entry) => String(entry.questionId) === String(questionId));
  return match?.answer ?? null;
};

/** Objective answers are stored as the chosen option index. */
export const objectiveAnswerLabel = (question, answer) => {
  if (answer === null || answer === undefined || String(answer).trim() === '') return null;
  const index = Number(answer);
  if (!Number.isInteger(index) || index < 0 || index >= (question?.options?.length || 0)) return null;
  return question.options[index];
};

export const isObjectiveCorrect = (question, answer) => {
  if (answer === null || answer === undefined || String(answer).trim() === '') return false;
  const index = Number(answer);
  return Number.isInteger(index) && index === question?.correctIndex;
};

export const scorePercent = (completion) => {
  if (!completion || !(completion.totalCount > 0)) return null;
  return Math.round((completion.correctCount / completion.totalCount) * 100);
};

export const submissionRate = (assignment) => {
  const total = Number(assignment?.studentCount || 0);
  if (total <= 0) return null;
  return Math.round((Number(assignment?.completedCount || 0) / total) * 100);
};

export const assignmentSummary = (assignments) => assignments.reduce(
  (totals, assignment) => ({
    total: totals.total + 1,
    students: totals.students + Number(assignment.studentCount || 0),
    submitted: totals.submitted + Number(assignment.completedCount || 0),
  }),
  { total: 0, students: 0, submitted: 0 },
);
