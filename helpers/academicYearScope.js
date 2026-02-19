import Class from '../models/Class.js';
import {
    getAcademicYearDateRange,
    isValidAcademicYear,
    resolveRequestedAcademicYear
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
    candidateClassIds = null
}) => {
    if (!schoolId || !academicYear) return [];

    const query = { school: schoolId, academicYear };
    if (Array.isArray(candidateClassIds) && candidateClassIds.length > 0) {
        query._id = { $in: candidateClassIds };
    }

    const rows = await Class.find(query).select('_id').lean();
    return rows.map((row) => row._id.toString());
};

export const isClassInAcademicYear = (classDoc, academicYear) => {
    if (!classDoc || !academicYear) return false;
    return String(classDoc.academicYear || '') === String(academicYear);
};

export const buildAcademicYearDateFilter = (academicYear, school) => {
    const range = getAcademicYearDateRange(
        academicYear,
        school?.settings?.academicYearStartMonth
    );
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
