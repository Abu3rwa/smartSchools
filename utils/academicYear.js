const ACADEMIC_YEAR_PATTERN = /^(\d{4})-(\d{4})$/;
const DEFAULT_START_MONTH = 8;

export const normalizeAcademicYear = (value) => String(value || '').trim();

export const parseAcademicYear = (value) => {
    const normalized = normalizeAcademicYear(value);
    const match = normalized.match(ACADEMIC_YEAR_PATTERN);
    if (!match) return null;

    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    return { startYear, endYear, normalized };
};

export const isValidAcademicYear = (value) => {
    const parsed = parseAcademicYear(value);
    if (!parsed) return false;
    return parsed.endYear === parsed.startYear + 1;
};

export const inferAcademicYear = (date = new Date(), startMonth = DEFAULT_START_MONTH) => {
    const parsedStartMonth = Number(startMonth);
    const effectiveStartMonth = Number.isInteger(parsedStartMonth) && parsedStartMonth >= 1 && parsedStartMonth <= 12
        ? parsedStartMonth
        : DEFAULT_START_MONTH;

    const currentMonth = date.getMonth() + 1;
    const startYear = currentMonth >= effectiveStartMonth ? date.getFullYear() : date.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
};

export const resolveSchoolAcademicYear = (school) => {
    const configuredYear = school?.settings?.currentAcademicYear;
    if (isValidAcademicYear(configuredYear)) {
        return normalizeAcademicYear(configuredYear);
    }

    const configuredStartMonth = school?.settings?.academicYearStartMonth;
    return inferAcademicYear(new Date(), configuredStartMonth);
};

export const resolveRequestedAcademicYear = (requestedAcademicYear, school) => {
    if (isValidAcademicYear(requestedAcademicYear)) {
        return normalizeAcademicYear(requestedAcademicYear);
    }
    return resolveSchoolAcademicYear(school);
};

export const getAcademicYearDateRange = (academicYear, schoolStartMonth = DEFAULT_START_MONTH) => {
    const parsed = parseAcademicYear(academicYear);
    if (!parsed) return null;

    const startMonth = Number(schoolStartMonth);
    const effectiveStartMonth = Number.isInteger(startMonth) && startMonth >= 1 && startMonth <= 12
        ? startMonth
        : DEFAULT_START_MONTH;

    const startDate = new Date(Date.UTC(parsed.startYear, effectiveStartMonth - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(parsed.endYear, effectiveStartMonth - 1, 1, 0, 0, 0, 0));
    endDate.setUTCDate(endDate.getUTCDate() - 1);
    endDate.setUTCHours(23, 59, 59, 999);

    return { startDate, endDate };
};

export const resolveAcademicYearDateRange = (academicYear, school) => {
    const explicitStart = school?.settings?.academicYearStartDate;
    const explicitEnd = school?.settings?.academicYearEndDate;

    if (explicitStart && explicitEnd) {
        const startDate = new Date(explicitStart);
        const endDate = new Date(explicitEnd);
        if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && startDate <= endDate) {
            return { startDate, endDate };
        }
    }

    return getAcademicYearDateRange(academicYear, school?.settings?.academicYearStartMonth);
};
