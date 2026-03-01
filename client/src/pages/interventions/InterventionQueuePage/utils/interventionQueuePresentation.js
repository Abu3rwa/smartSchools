/**
 * Formats a date string for display in the intervention queue.
 * @param {string|Date} value - The date to format.
 * @returns {string} The formatted date string.
 */
export const formatDate = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};
