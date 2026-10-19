export const hideMapPracticeQuestionAnswers = (question) => {
  return Object.fromEntries(Object.entries(question).filter(([key]) =>
    !['correctAnswer', 'explanation', 'distractorNote'].includes(key)
  ));
};

export const hideMapPracticeAttemptAnswerKeys = (attempt) => ({
  ...attempt,
  answers: (attempt.answers || []).map((answer) => {
    return Object.fromEntries(Object.entries(answer).filter(([key]) =>
      !['correctAnswerSnapshot', 'explanationSnapshot'].includes(key)
    ));
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
