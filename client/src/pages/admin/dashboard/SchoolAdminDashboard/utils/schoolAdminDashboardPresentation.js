/**
 * Pure presentation helpers for School Admin Dashboard.
 */

/**
 * @param {number} value
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateClassLabel(value, maxLen = 18) {
    if (!value) return 'Class';
    return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
}

/**
 * Localized thousands separator for KPI values.
 * @param {number} value
 * @param {string} locale
 * @returns {string}
 */
export function formatCount(value, locale = 'en') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return new Intl.NumberFormat(locale).format(numeric);
}

/**
 * Attendance rate as a short percentage, or null when there is nothing to show.
 * @param {number|null|undefined} value
 * @returns {string|null}
 */
export function formatPercent(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return `${Number.isInteger(numeric) ? numeric.toFixed(0) : numeric.toFixed(1)}%`;
}

/**
 * Small "+N" style figure for month-over-month additions.
 * @param {number} value
 * @returns {string}
 */
export function formatDelta(value) {
    const numeric = Number(value) || 0;
    return numeric > 0 ? `+${numeric}` : String(numeric);
}

/**
 * Splits today's attendance into proportional bar segments.
 * @param {{totalStudents?: number, present?: number, late?: number, absent?: number}|null} summary
 * @returns {Array<{key: string, percent: number}>}
 */
export function buildAttendanceSegments(summary) {
    const total = Number(summary?.totalStudents) || 0;
    if (total <= 0) return [];
    const toPercent = (value) => Math.min(100, Math.max(0, ((Number(value) || 0) / total) * 100));
    return [
        { key: 'present', percent: toPercent(summary.present) },
        { key: 'late', percent: toPercent(summary.late) },
        { key: 'absent', percent: toPercent(summary.absent) },
    ].filter((segment) => segment.percent > 0);
}

/**
 * "2026-10" -> localized short month name ("Oct").
 * @param {string} monthKey
 * @param {string} locale
 * @returns {string}
 */
export function formatMonthKeyLabel(monthKey, locale = 'en') {
    const [yearPart, monthPart] = String(monthKey || '').split('-');
    const monthIndex = Number(monthPart) - 1;
    if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
        return monthKey || '';
    }
    const year = Number(yearPart);
    return new Intl.DateTimeFormat(locale, { month: 'short' }).format(
        new Date(Date.UTC(Number.isFinite(year) ? year : 2000, monthIndex, 1))
    );
}
