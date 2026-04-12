import Class from '../models/Class.js';
import {
    getAcademicYearDateRange,
    isValidAcademicYear,
    resolveRequestedAcademicYear,
    resolveAcademicYearDateRange
} from '../utils/academicYear.js';

export const resolveAcademicYearForRequest = (
    req,
    requestedAcademicYear = null,
    { allowOverride = false } = {}
) => {
    const schoolScopedAcademicYear = req.academicYear || resolveRequestedAcademicYear(null, req.school);
    if (allowOverride && isValidAcademicYear(requestedAcademicYear)) {
        return requestedAcademicYear;
    }
    return schoolScopedAcademicYear;
};

export const getClassIdsForAcademicYear = async ({
    schoolId,
    academicYear,
    candidateClassIds = null,
    departmentId = null
}) => {
    if (!schoolId || !academicYear) return [];

    const query = { school: schoolId, academicYear };
    if (Array.isArray(candidateClassIds) && candidateClassIds.length > 0) {
        query._id = { $in: candidateClassIds };
    }
    if (departmentId) {
        query.department = departmentId;
    }

    const rows = await Class.find(query).select('_id').lean();
    return rows.map((row) => row._id.toString());
};

export const isClassInAcademicYear = (classDoc, academicYear) => {
    if (!classDoc || !academicYear) return false;
    return String(classDoc.academicYear || '') === String(academicYear);
};

export const buildAcademicYearDateFilter = (academicYear, school) => {
    const range = resolveAcademicYearDateRange(academicYear, school);
    if (!range) return null;
    return {
        $gte: range.startDate,
        $lte: range.endDate
    };
};

export const resolveAcademicYearDateRangeForRequest = (
    req,
    requestedAcademicYear = null,
    { allowOverride = false } = {}
) => {
    const academicYear = resolveAcademicYearForRequest(req, requestedAcademicYear, { allowOverride });
    const dateFilter = buildAcademicYearDateFilter(academicYear, req.school);
    return { academicYear, dateFilter };
};

export const clampDateRangeToAcademicYear = (
    requestedRange = {},
    academicYearDateFilter = null
) => {
    if (!academicYearDateFilter?.$gte || !academicYearDateFilter?.$lte) {
        return requestedRange;
    }

    const hasRequestedStart = requestedRange.$gte instanceof Date;
    const hasRequestedEnd = requestedRange.$lte instanceof Date;

    const range = {};
    range.$gte = hasRequestedStart
        ? new Date(Math.max(requestedRange.$gte.getTime(), academicYearDateFilter.$gte.getTime()))
        : academicYearDateFilter.$gte;
    range.$lte = hasRequestedEnd
        ? new Date(Math.min(requestedRange.$lte.getTime(), academicYearDateFilter.$lte.getTime()))
        : academicYearDateFilter.$lte;

    if (range.$gte > range.$lte) {
        return null;
    }

    return range;
};

export const isDateInAcademicYear = (dateValue, academicYearDateFilter) => {
    if (!dateValue || !academicYearDateFilter?.$gte || !academicYearDateFilter?.$lte) {
        return false;
    }

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return false;

    return date >= academicYearDateFilter.$gte && date <= academicYearDateFilter.$lte;
};

/**
 * Assert the request targets the current (writable) academic year.
 * Call at the top of any mutating controller to block writes to past years.
 * Returns true if write is allowed, false if response was already sent (403).
 */
export const assertCurrentYearForWrite = (req, res) => {
    if (!req.isCurrentAcademicYear) {
        res.status(403).json({
            success: false,
            message: 'This academic year is read-only. Switch to the current year to make changes.'
        });
        return false;
    }
    return true;
};

/**
 * Resolve the semester filter for a request.
 * Prefers an explicit query/body param; falls back to the global x-academic-semester header.
 * Returns 1, 2, or null (null = full year / no semester filter).
 */
export const getSemesterFilter = (req) => {
    const querySemester = parseInt(req.query?.semester ?? req.body?.semester, 10);
    if (querySemester === 1 || querySemester === 2) return querySemester;
    return req.academicSemester ?? null;
};
