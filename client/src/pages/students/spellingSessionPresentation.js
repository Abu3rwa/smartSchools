const CELEBRATION_REASONS = new Set(['word-list-complete', 'curriculum-exhausted', 'retest-quiz-complete']);

export const getCelebrationTier = (answeredWords) => {
    const count = Number(answeredWords) || 0;
    if (count >= 20) return 'bouquet';
    if (count >= 10) return 'garden';
    if (count >= 5) return 'bunch';
    if (count >= 1) return 'sprout';
    return 'none';
};

export const isCelebratoryCompletion = (session) => {
    if (!session || session.status !== 'completed') return false;
    if (session.completionReason) return CELEBRATION_REASONS.has(session.completionReason);
    const allowed = Number(session.maxMistakesAllowed) || 3;
    const mistakes = Number(session.mistakeCount) || 0;
    return mistakes < allowed;
};

export const getReviewWords = (attempts) => (Array.isArray(attempts) ? attempts : [])
    .filter((attempt) => attempt && !attempt.correct);

export const getLanternStats = ({ attempts, max = 18 } = {}) => {
    const list = Array.isArray(attempts) ? attempts : [];
    const cap = Math.max(1, Number(max) || 18);
    const answered = list.length;
    const correct = list.filter((attempt) => attempt?.correct).length;
    const lanterns = Math.min(answered, cap);
    return {
        answered,
        correct,
        lanterns,
        lit: Math.min(correct, lanterns),
        hidden: Math.max(answered - cap, 0)
    };
};
