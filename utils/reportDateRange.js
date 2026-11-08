import {
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear
} from 'date-fns';

const REPORT_TYPES = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'];

const parseDate = (value, label) => {
    if (value === undefined || value === null || value === '') {
        throw new Error(`Custom date range requires a valid ${label}.`);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Custom date range has an invalid ${label}.`);
    }
    return date;
};

const startOfDay = (date) => {
    const copy = new Date(date.getTime());
    copy.setHours(0, 0, 0, 0);
    return copy;
};

const endOfDay = (date) => {
    const copy = new Date(date.getTime());
    copy.setHours(23, 59, 59, 999);
    return copy;
};

/**
 * Validated report period boundaries. Dates are inclusive local days: the end
 * date covers the whole day (23:59:59.999). "yearly" is a calendar year — the
 * label says so instead of implying configured academic-year boundaries.
 */
export function calculateReportDateRange(reportType, customRange, { now = new Date() } = {}) {
    const type = REPORT_TYPES.includes(reportType) ? reportType : 'monthly';
    let startDate;
    let endDate;
    let period;

    switch (type) {
        case 'weekly':
            startDate = startOfWeek(now);
            endDate = endOfWeek(now);
            period = `Week of ${startDate.toLocaleDateString()}`;
            break;
        case 'quarterly': {
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            endDate = endOfMonth(new Date(now.getFullYear(), quarter * 3 + 2, 1));
            period = `Q${quarter + 1} ${now.getFullYear()}`;
            break;
        }
        case 'yearly':
            startDate = startOfYear(now);
            endDate = endOfYear(now);
            period = `Calendar Year ${now.getFullYear()}`;
            break;
        case 'custom': {
            const start = parseDate(customRange?.startDate, 'start date');
            const end = parseDate(customRange?.endDate, 'end date');
            if (startOfDay(start) > startOfDay(end)) {
                throw new Error('Custom date range is out of order: the start date must be on or before the end date.');
            }
            startDate = startOfDay(start);
            endDate = endOfDay(end);
            period = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
            break;
        }
        default:
            startDate = startOfMonth(now);
            endDate = endOfMonth(now);
            period = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    return { startDate, endDate, period, reportType: type };
}

export { REPORT_TYPES };