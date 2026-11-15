export const ACCENTS = ['us', 'uk'];
export const FLAG_REASONS = ['silent', 'unclear', 'wrong'];
export const GRADES = ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'];

export const accentLabel = (accent) => (accent === 'us' ? 'US' : 'UK');

export const isWordReviewed = (entry) => Boolean(entry?.accents?.us?.reviewed && entry?.accents?.uk?.reviewed);

export const summarizeWords = (words = []) => ({
    totalWords: words.length,
    reviewedWords: words.filter(isWordReviewed).length,
    pendingWords: words.filter((entry) => !isWordReviewed(entry)).length,
    missingClips: words.filter((entry) => entry?.accents?.us?.missing || entry?.accents?.uk?.missing).length,
    flaggedClips: words.filter((entry) => entry?.accents?.us?.flagged || entry?.accents?.uk?.flagged).length,
    removedClips: words.filter((entry) => entry?.accents?.us?.removed || entry?.accents?.uk?.removed).length
});

/** Applies one accent's new state to the queue without asking the server again. */
export const applyAccentPatch = (words = [], word, accent, patch = {}) => words.map((entry) => {
    if (entry.word !== word) return entry;
    const current = entry.accents?.[accent] || {};
    return { ...entry, accents: { ...entry.accents, [accent]: { ...current, ...patch } } };
});

/** A clip can be regenerated while it is playable and under the attempt limit. */
export const canRegenerateClip = (state, attemptLimit) => Boolean(
    state
    && !state.missing
    && !state.removed
    && Number(state.attempts || 0) < Number(attemptLimit)
);
