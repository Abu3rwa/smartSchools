const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

/**
 * One review step per question, critical thinking first, then the quiz.
 * Keys match the ids used by the answers map.
 */
export const buildQuestionSteps = ({ thinking = [], quiz = [] } = {}) => {
  const steps = [];
  [...thinking].sort(byOrder).forEach((question) => {
    steps.push({ key: String(question._id), kind: 'thinking', question });
  });
  [...quiz].sort(byOrder).forEach((question) => {
    steps.push({ key: String(question._id), kind: 'quiz', question });
  });
  return steps;
};

export const isStepAnswered = (step, answers = {}) => {
  const raw = answers?.[step.key];
  if (step.kind === 'quiz') {
    const index = Number(raw);
    return (
      String(raw ?? '') !== '' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < (step.question?.options?.length || 0)
    );
  }
  return String(raw || '').trim().length > 0;
};

/**
 * Answer status for the review step. Short answers are optional, so only the
 * objective questions hold the submit button back.
 */
export const summarizeSteps = (steps = [], answers = {}) => {
  const items = steps.map((step) => ({
    ...step,
    answered: isStepAnswered(step, answers),
  }));
  const objective = items.filter((step) => step.kind === 'quiz');
  const missing = objective
    .filter((item) => !item.answered)
    .map((item) => item.key);
  return {
    items,
    answered: items.filter((item) => item.answered).length,
    total: items.length,
    objectiveTotal: objective.length,
    missing,
    canSubmit: missing.length === 0,
  };
};

export const firstUnansweredStep = (summary) => {
  const item = summary?.items?.find(
    (step) => step.kind === 'quiz' && !step.answered,
  );
  return item ? item.key : null;
};
