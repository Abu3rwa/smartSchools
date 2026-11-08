// Pure transitions for the post-answer feedback screen. Kept outside the slice
// so the decision table can be tested without importing the app's API layer.

export const resolvePracticeStatusAfterSubmit = (payload = {}) => {
    if (payload.sessionComplete) return 'session_complete';
    if (payload.newlyMastered) return 'mastered';
    return 'feedback';
};

export const shouldShowPracticeFeedback = (lastResult, generating) =>
    Boolean(lastResult) && !generating;
