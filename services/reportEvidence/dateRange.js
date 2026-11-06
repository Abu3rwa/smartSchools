/**
 * Collectors are handed Date objects (calculateDateRange builds them). Turning
 * one into a string and appending a time suffix yields an Invalid Date, which
 * Mongoose rejects with a CastError — that is why sources came back as
 * "Could not be read". These helpers work from the date value instead.
 */
const asDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export function startOfDay(value) {
    const date = asDate(value);
    if (!date) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

export function endOfDay(value) {
    const date = asDate(value);
    if (!date) return null;
    date.setHours(23, 59, 59, 999);
    return date;
}
