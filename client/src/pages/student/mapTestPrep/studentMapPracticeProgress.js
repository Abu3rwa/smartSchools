const hasResponseValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasResponseValue);
  if (typeof value === 'object') return Object.values(value).some(hasResponseValue);
  return true;
};

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