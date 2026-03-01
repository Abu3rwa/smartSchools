/**
 * Pure presentation helpers for Practice History Page.
 */

/**
 * @param {string|number} value
 * @returns {string}
 */
export function formatAttemptDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString();
}

/**
 * @param {number} timeSpentSeconds
 * @returns {string}
 */
export function formatTimeSpent(timeSpentSeconds) {
    if (!timeSpentSeconds || timeSpentSeconds <= 0) return '';
    return ` (${timeSpentSeconds}s)`;
}
