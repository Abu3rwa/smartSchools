const hasResponseValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasResponseValue);
  if (typeof value === 'object') return Object.values(value).some(hasResponseValue);
  return true;
};

export const isMapPracticeAnswerRecorded = (response) => hasResponseValue(response);

export const getMapPracticeSetProgress = (attempts = [], setId, totalQuestions = 0) => {
  const attempt = attempts.find((item) => String(item.set?._id || item.set) === String(setId));
  const answeredQuestionIds = new Set(
    (attempt?.answers || [])
      .filter((answer) => hasResponseValue(answer.response))
      .map((answer) => String(answer.question?._id || answer.question || answer.questionId || ''))
      .filter(Boolean)
  );
  const total = Math.max(0, Number(totalQuestions) || 0);
  const answered = Math.min(total, answeredQuestionIds.size);

  return {
    answered,
    total,
    percentage: total ? Math.round((answered / total) * 100) : 0
  };
};

export const getMapPracticeSetAction = (attempt, progress) => {
  if (attempt?.status === 'submitted' || attempt?.status === 'reviewed') {
    return { label: 'Review answers', disabled: false };
  }

  if (progress.total > 0 && progress.answered >= progress.total) {
    return { label: 'Review & submit', disabled: false };
  }

  return {
    label: progress.answered > 0 ? 'Continue' : 'Start',
    disabled: false
  };
};

export const getMapPracticeAttemptState = (questions = [], attempt) => {
  const questionIndexes = new Map(questions.map((question, index) => [String(question._id), index]));
  const answers = {};

  (attempt?.answers || []).forEach((answer) => {
    const questionId = String(answer.question?._id || answer.question || answer.questionId || '');
    if (questionIndexes.has(questionId) && hasResponseValue(answer.response)) {
      answers[questionId] = answer.response;
    }
  });

  const unansweredIndex = questions.findIndex((question) => !hasResponseValue(answers[question._id]));
  const currentIndex = unansweredIndex >= 0
    ? unansweredIndex
    : Math.max(0, questions.length - 1);

  return { answers, currentIndex };
};