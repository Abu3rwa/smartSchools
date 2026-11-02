/** Every student payload reports how many questions exist, even while they are hidden. */
export const gateQuestionCounts = (result) => ({
  comprehension: (result?.comprehensionQuestions || []).length,
  criticalThinking: (result?.criticalThinkingQuestions || []).length,
});

/**
 * A gated, unfinished student never receives the locked questions. Counts stay so
 * the page can explain what is waiting; teacher views never call this.
 */
export const stripLockedQuestions = (result) => {
  if (!result) return result;
  result.questionCounts = gateQuestionCounts(result);
  const gate = result.readingGate;
  if (!gate?.enabled || gate.unlocked) return result;
  result.comprehensionQuestions = [];
  if (result.text) result.text.comprehensionQuestions = [];
  if (gate.lockScope === "quiz_and_thinking") {
    result.criticalThinkingQuestions = [];
    if (result.text) result.text.criticalThinkingQuestions = [];
  }
  return result;
};
