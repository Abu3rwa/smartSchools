/**
 * Pure presentation helpers for School Admin Dashboard.
 */

/**
 * @param {string} [month]
 * @returns {string}
 */
export function formatMonthTick(month) {
    return month || '';
}

/**
 * @param {number} value
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateClassLabel(value, maxLen = 18) {
    if (!value) return 'Class';
    return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
}
