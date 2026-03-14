export const DEFAULT_WEEK_WORKING_DAYS = Object.freeze([1, 2, 3, 4, 5]);
export const ALL_WEEK_DAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

const toDayNumber = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
};

export const normalizeWeekWorkingDays = (candidate, fallback = DEFAULT_WEEK_WORKING_DAYS) => {
    if (!Array.isArray(candidate)) {
        return [...fallback];
    }

    const normalized = Array.from(
        new Set(
            candidate
                .map(toDayNumber)
                .filter((day) => day !== null && day >= 0 && day <= 6)
        )
    ).sort((left, right) => left - right);

    if (normalized.length === 0) {
        return [...fallback];
    }

    return normalized;
};

export const getInvalidWeekWorkingDayValues = (candidate, allowedDays = ALL_WEEK_DAYS) => {
    if (!Array.isArray(candidate)) return ['invalid-type'];

    const allowed = new Set(allowedDays);
    return candidate.filter((value) => {
        const parsed = toDayNumber(value);
        return parsed === null || !allowed.has(parsed);
    });
};

export const getWeekendDays = (weekWorkingDays = DEFAULT_WEEK_WORKING_DAYS) => {
    const normalized = normalizeWeekWorkingDays(weekWorkingDays);
    const workingSet = new Set(normalized);
    return ALL_WEEK_DAYS.filter((day) => !workingSet.has(day));
};
