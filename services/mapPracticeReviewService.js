const hashString = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededShuffle = (items, seed) => {
  const result = [...items];
  let state = seed || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

export const buildMapPracticeMatchingColumns = (question) => {
  const pairs = (Array.isArray(question?.matchingPairs) ? question.matchingPairs : [])
    .map((pair) => ({ left: String(pair?.left ?? '').trim(), right: String(pair?.right ?? '').trim() }))
    .filter((pair) => pair.left && pair.right);
  if (!pairs.length) return null;

  const terms = pairs.map((pair) => pair.left);
  const choices = Array.from(new Set(pairs.map((pair) => pair.right)));
  // The same student must always see one order, while different students see different ones.
  const shuffled = seededShuffle(choices, hashString(`${question._id}|${question.student}`));

  return { terms, choices: shuffled };
};

export const hideMapPracticeQuestionAnswers = (question) => {
  const safe = Object.fromEntries(Object.entries(question).filter(([key]) =>
    !['correctAnswer', 'explanation', 'distractorNote', 'matchingPairs'].includes(key)
  ));
  if (safe.questionType !== 'matching') return safe;
  return {
    ...safe,
    matchingColumns: buildMapPracticeMatchingColumns(question) ?? { terms: [], choices: [] }
  };
};

export const hideMapPracticeAttemptAnswerKeys = (attempt) => ({
  ...attempt,
  answers: (attempt.answers || []).map((answer) => {
    const safe = Object.fromEntries(Object.entries(answer).filter(([key]) =>
      !['correctAnswerSnapshot', 'explanationSnapshot', 'matchingPairsSnapshot'].includes(key)
    ));
    if (!safe.questionSnapshot) return safe;
    // Snapshots only ever store the shuffled columns, never the term-to-definition mapping.
    safe.questionSnapshot = Object.fromEntries(
      Object.entries(safe.questionSnapshot).filter(([key]) => key !== 'matchingPairs')
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
