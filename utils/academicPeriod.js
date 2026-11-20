import {
    isValidAcademicYear,
    normalizeAcademicYear,
    resolveSchoolAcademicYear
} from './academicYear.js';

export const ACTIVE_SEMESTERS = [1, 2];

// Matches the client's historical inference: Aug–Dec is semester 1, Jan–Jul semester 2.
export const inferActiveSemester = (date = new Date()) => (date.getMonth() >= 7 ? 1 : 2);

export const normalizeActiveSemester = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return ACTIVE_SEMESTERS.includes(parsed) ? parsed : null;
};

export const resolveSchoolActiveSemester = (school, date = new Date()) => {
    const configured = normalizeActiveSemester(school?.settings?.currentSemester);
    return configured ?? inferActiveSemester(date);
};

export const resolveSchoolActivePeriod = (school, date = new Date()) => ({
    academicYear: resolveSchoolAcademicYear(school),
    semester: resolveSchoolActiveSemester(school, date)
});

export const validateAcademicPeriodPayload = (payload) => {
    const data = {};

    if (payload?.academicYear !== undefined) {
        const year = normalizeAcademicYear(payload.academicYear);
        if (!isValidAcademicYear(year)) {
            return { valid: false, message: 'Academic year must be in YYYY-YYYY format (consecutive years)' };
        }
        data.academicYear = year;
    }

    if (payload?.semester !== undefined) {
        const semester = normalizeActiveSemester(payload.semester);
        if (!semester) {
            return { valid: false, message: 'Semester must be 1 or 2. Full Year is a reporting option, not an active semester.' };
        }
        data.semester = semester;
    }

    if (Object.keys(data).length === 0) {
        return { valid: false, message: 'Provide academicYear and/or semester' };
    }

    return { valid: true, data };
};