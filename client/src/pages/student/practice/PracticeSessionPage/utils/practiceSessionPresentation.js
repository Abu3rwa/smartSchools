/**
 * Formats a percentage value.
 * @param {number} value 
 * @returns {number}
 */
export const formatPercent = (value) => {
    return Math.round(value || 0);
};

/**
 * Gets the streak label based on current session context.
 * @param {object} sessionContext 
 * @returns {string}
 */
export const getStreakLabel = (sessionContext) => {
    return (sessionContext?.incorrectStreak || 0) > (sessionContext?.correctStreak || 0)
        ? 'Learning Streak'
        : 'Correct Streak';
};

/**
 * Gets usable topics from session context.
 * @param {object} sessionContext 
 * @returns {string[]}
 */
export const getUsableTopics = (sessionContext) => {
    const rawTopics = sessionContext?.recentTopics || [];
    return rawTopics.filter(
        (t) => typeof t === 'string' && t.length > 0 && !t.toLowerCase().includes(' is reading ')
    );
};

/**
 * Gets the display text for a question type.
 * @param {string} type
 * @returns {string}
 */
const QUESTION_TYPE_LABELS = {
    multiple_choice: 'Multiple choice',
    multiple_select: 'Multiple select',
    true_false: 'True or false',
    short_answer: 'Short answer',
    matching: 'Matching',
    ordering: 'Ordering',
    fill_in_blank: 'Fill in the blanks',
    numeric_response: 'Numeric answer'
};

export const getQuestionTypeDisplay = (type) => {
    if (!type) return '';
    return QUESTION_TYPE_LABELS[type] || type.replace(/_/g, ' ');
};
