import { resolveTimeZone, zonedDateTimeToUtc } from './schoolTimezone.js';

export const DEFAULT_DUE_HOUR = 23;
export const DEFAULT_DUE_MINUTE = 59;

/**
 * Converts the app's date-only due date into Classroom's separate dueDate/dueTime fields.
 * The app stores a calendar day (UTC midnight). The deadline is end of that day in the
 * school's time zone, expressed in UTC because Classroom documents dueDate/dueTime as UTC.
 */
export const toClassroomDue = (dueDate, timeZone) => {
    if (!dueDate) return null;
    const parsed = dueDate instanceof Date ? dueDate : new Date(dueDate);
    if (Number.isNaN(parsed.getTime())) return null;

    const instant = zonedDateTimeToUtc(
        {
            year: parsed.getUTCFullYear(),
            month: parsed.getUTCMonth() + 1,
            day: parsed.getUTCDate(),
            hour: DEFAULT_DUE_HOUR,
            minute: DEFAULT_DUE_MINUTE
        },
        resolveTimeZone(timeZone)
    );

    return {
        dueDate: {
            year: instant.getUTCFullYear(),
            month: instant.getUTCMonth() + 1,
            day: instant.getUTCDate()
        },
        dueTime: {
            hours: instant.getUTCHours(),
            minutes: instant.getUTCMinutes()
        }
    };
};
