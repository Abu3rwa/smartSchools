/**
 * Student feedback is templated, not generated. Every result gets one strength,
 * one next step and a short list of words to practise.
 */
export const accuracyTier = (accuracy) => {
    const value = Number(accuracy) || 0;
    if (value >= 95) return 'strong';
    if (value >= 90) return 'getting';
    return 'keep';
};

export const tierKeyFor = (tier) => `fluency.tier.${tier}`;

export const teacherAccuracyBand = (accuracy) => {
    const value = Number(accuracy) || 0;
    if (value >= 95) return 'independent';
    if (value >= 90) return 'instructional';
    return 'needs-support';
};

const focusWordNames = (focusWords = []) => focusWords
    .map((item) => (typeof item === 'string' ? item : item?.word))
    .map((word) => String(word || '').trim())
    .filter(Boolean)
    .slice(0, 5);

export const buildFeedback = ({
    accuracy = 0,
    completion = 0,
    wpm = null,
    targetAccuracy = 95,
    targetWpm = null,
    previous = null,
    focusWords = [],
    goalMet = false,
    readings = 0,
    selfCorrections = 0
} = {}) => {
    const tier = accuracyTier(accuracy);
    const words = focusWordNames(focusWords);
    const accuracyDelta = previous?.accuracy != null ? Math.round(accuracy - previous.accuracy) : null;
    const paceDelta = previous?.wpm != null && wpm != null ? Math.round(wpm - previous.wpm) : null;

    let strength;
    if (goalMet) {
        strength = { key: 'fluency.feedback.strength.goalMet', params: { n: readings } };
    } else if (accuracyDelta !== null && accuracyDelta >= 2) {
        strength = { key: 'fluency.feedback.strength.improved', params: { delta: accuracyDelta } };
    } else if (paceDelta !== null && paceDelta >= 5) {
        strength = { key: 'fluency.feedback.strength.paceImproved', params: { delta: paceDelta } };
    } else if (completion >= 100) {
        strength = { key: 'fluency.feedback.strength.finished', params: {} };
    } else if (accuracy >= targetAccuracy) {
        strength = { key: 'fluency.feedback.strength.accurate', params: { accuracy } };
    } else if (selfCorrections > 0) {
        strength = { key: 'fluency.feedback.strength.corrected', params: {} };
    } else {
        strength = { key: 'fluency.feedback.strength.started', params: {} };
    }

    let nextStep;
    if (words.length) {
        nextStep = {
            key: 'fluency.feedback.nextStep.practiceWords',
            params: { words: words.slice(0, 3).join(', ') }
        };
    } else if (completion < 80) {
        nextStep = { key: 'fluency.feedback.nextStep.finishPart', params: {} };
    } else if (accuracy < targetAccuracy) {
        nextStep = { key: 'fluency.feedback.nextStep.listenThenRead', params: {} };
    } else if (goalMet) {
        // The pace goal looks at the best reading, so this one may be slower.
        nextStep = { key: 'fluency.feedback.nextStep.nextPart', params: {} };
    } else if (wpm != null && targetWpm != null && wpm < targetWpm) {
        nextStep = { key: 'fluency.feedback.nextStep.smoothPace', params: { target: targetWpm } };
    } else {
        nextStep = { key: 'fluency.feedback.nextStep.readAgain', params: {} };
    }

    return {
        tier,
        tierKey: tierKeyFor(tier),
        teacherBand: teacherAccuracyBand(accuracy),
        strength,
        nextStep,
        words
    };
};
