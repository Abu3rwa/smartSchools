// Matching questions store the student response as [{ left, right }] and only keep the pairs they actually chose.
export const getMatchingColumns = (question) => {
  const pairs = Array.isArray(question?.matchingPairs) ? question.matchingPairs : [];
  const columns = question?.matchingColumns || {};
  const terms = (Array.isArray(columns.terms) && columns.terms.length ? columns.terms : pairs.map((pair) => pair?.left))
    .map((term) => String(term ?? '').trim())
    .filter(Boolean);
  const choices = (Array.isArray(columns.choices) && columns.choices.length ? columns.choices : pairs.map((pair) => pair?.right))
    .map((choice) => String(choice ?? '').trim())
    .filter(Boolean);

  return { terms, choices };
};

export const readMatchingSelections = (response) => new Map(
  (Array.isArray(response) ? response : [])
    .filter((entry) => entry && typeof entry === 'object' && String(entry.right ?? '').trim())
    .map((entry) => [String(entry.left), String(entry.right)])
);

export const buildMatchingResponse = (selections) => [...selections.entries()]
  .filter(([, right]) => String(right ?? '').trim())
  .map(([left, right]) => ({ left, right }));

export const getMatchingAnswerRows = (question, response) => {
  const { terms } = getMatchingColumns(question);
  const selections = readMatchingSelections(response);
  const correctByTerm = new Map(
    (Array.isArray(question?.matchingPairs) ? question.matchingPairs : [])
      .filter((pair) => pair?.left)
      .map((pair) => [String(pair.left), String(pair.right ?? '')])
  );
  const rows = terms.length ? terms : [...selections.keys()];

  return rows.map((term) => {
    const choice = selections.get(term) || '';
    const correct = correctByTerm.get(term);
    return {
      term,
      choice,
      correct,
      unmatched: !choice,
      isCorrect: correct === undefined || !correct
        ? null
        : choice.trim().toLowerCase() === correct.trim().toLowerCase()
    };
  });
};
