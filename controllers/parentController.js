import { asyncHandler } from '../middleware/errorHandler.js';
import {
    clampDateRangeToAcademicYear,
    resolveAcademicYearDateRangeForRequest
} from '../helpers/academicYearScope.js';
import {
    getParentChildAttendanceSummary,
    getParentChildGrades,
    getParentChildReports,
    getParentChildTimetable,
    getParentChildren,
    getParentDashboard,
    getParentSettings,
    updateParentSettings,
    markAllParentUpdatesAsRead,
    getParentUpdates,
    getParentUpdateById
} from '../services/parentDashboardService.js';

const parseDateValue = (raw, endOfDay = false) => {
    if (!raw) return null;
    const value = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return Number.NaN;
    if (endOfDay) {
        parsed.setHours(23, 59, 59, 999);
    } else {
        parsed.setHours(0, 0, 0, 0);
    }
    return parsed;
};

const isValidDateObject = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const parseDateRangeFromQuery = ({ from, to }, academicYearDateFilter) => {
    const requestedRange = {};
    if (from) {
        const parsedFrom = parseDateValue(from, false);
        if (!isValidDateObject(parsedFrom)) {
            return { error: 'Invalid from date. Expected YYYY-MM-DD.' };
        }
        requestedRange.$gte = parsedFrom;
    }
    if (to) {
        const parsedTo = parseDateValue(to, true);
        if (!isValidDateObject(parsedTo)) {
            return { error: 'Invalid to date. Expected YYYY-MM-DD.' };
        }
        requestedRange.$lte = parsedTo;
    }
    if (requestedRange.$gte && requestedRange.$lte && requestedRange.$gte > requestedRange.$lte) {
        return { error: 'from must be before or equal to to.' };
    }
    const scopedRange = clampDateRangeToAcademicYear(requestedRange, academicYearDateFilter);
    if (Object.keys(requestedRange).length > 0 && !scopedRange) {
        return { error: 'Requested date range is outside the current academic year.' };
    }
    return { range: scopedRange || academicYearDateFilter || null };
};

const parseSemester = (termValue) => {
    if (termValue == null || termValue === '') return { semester: null };
    const normalized = String(termValue).trim().toLowerCase();
    const oneValues = new Set(['1', 'term1', 'semester1', 's1', 'first']);
    const twoValues = new Set(['2', 'term2', 'semester2', 's2', 'second']);
    if (oneValues.has(normalized)) return { semester: 1 };
    if (twoValues.has(normalized)) return { semester: 2 };
    return { error: 'Invalid term value. Use 1 or 2.' };
};

/**
 * @desc    Get children linked to authenticated parent
 * @route   GET /api/parent/children
 * @access  Private (parent)
 */
export const getParentChildrenController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const data = await getParentChildren({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear
    });

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get parent dashboard summary in one payload
 * @route   GET /api/parent/dashboard
 * @access  Private (parent)
 */
export const getParentDashboardController = asyncHandler(async (req, res) => {
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const data = await getParentDashboard({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        dateFilter
    });

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get parent updates feed (paginated)
 * @route   GET /api/parent/updates
 * @access  Private (parent)
 */
export const getParentUpdatesController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const data = await getParentUpdates({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        page: req.query.page,
        limit: req.query.limit,
        childId: req.query.childId,
        type: req.query.type,
        unreadOnly: req.query.unreadOnly
    });

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get one parent update with full content
 * @route   GET /api/parent/updates/:id
 * @access  Private (parent)
 */
export const getParentUpdateByIdController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const update = await getParentUpdateById({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        updateId: req.params.id
    });

    if (!update) {
        return res.status(404).json({
            success: false,
            message: 'Update not found'
        });
    }

    res.status(200).json({
        success: true,
        data: { update }
    });
});

/**
 * @desc    Mark all parent updates as read
 * @route   PATCH /api/parent/updates/read-all
 * @access  Private (parent)
 */
export const markAllParentUpdatesAsReadController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const data = await markAllParentUpdatesAsRead({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear
    });

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get child attendance summary for parent
 * @route   GET /api/parent/children/:childId/attendance-summary
 * @access  Private (parent)
 */
export const getParentChildAttendanceSummaryController = asyncHandler(async (req, res) => {
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const { range, error } = parseDateRangeFromQuery({
        from: req.query.from,
        to: req.query.to
    }, dateFilter);
    if (error) {
        return res.status(400).json({ success: false, message: error });
    }

    const data = await getParentChildAttendanceSummary({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        dateRange: range
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get child grades for parent view
 * @route   GET /api/parent/children/:childId/grades
 * @access  Private (parent)
 */
export const getParentChildGradesController = asyncHandler(async (req, res) => {
    const { academicYear, dateFilter } = resolveAcademicYearDateRangeForRequest(req);
    const { semester, error: semesterError } = parseSemester(req.query.term);
    if (semesterError) {
        return res.status(400).json({ success: false, message: semesterError });
    }

    const { range, error: rangeError } = parseDateRangeFromQuery({
        from: req.query.from,
        to: req.query.to
    }, dateFilter);
    if (rangeError) {
        return res.status(400).json({ success: false, message: rangeError });
    }

    const data = await getParentChildGrades({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        subjectId: req.query.subject || null,
        semester,
        dateRange: range,
        page: req.query.page,
        limit: req.query.limit
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get weekly child timetable for parent view
 * @route   GET /api/parent/children/:childId/timetable
 * @access  Private (parent)
 */
export const getParentChildTimetableController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const referenceDate = req.query.date ? parseDateValue(req.query.date, false) : new Date();
    if (!isValidDateObject(referenceDate)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid date. Expected YYYY-MM-DD.'
        });
    }

    const data = await getParentChildTimetable({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        referenceDate
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get child report history for parent view
 * @route   GET /api/parent/children/:childId/reports
 * @access  Private (parent)
 */
export const getParentChildReportsController = asyncHandler(async (req, res) => {
    const { academicYear } = resolveAcademicYearDateRangeForRequest(req);
    const normalizedType = req.query.type ? String(req.query.type).trim().toLowerCase() : null;
    if (normalizedType && !['daily', 'monthly', 'ai'].includes(normalizedType)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid type. Use daily, monthly, or ai.'
        });
    }

    const data = await getParentChildReports({
        schoolId: req.schoolId,
        parentUser: req.user,
        academicYear,
        childId: req.params.childId,
        type: normalizedType,
        period: req.query.period || null,
        page: req.query.page,
        limit: req.query.limit
    });

    if (!data) {
        return res.status(404).json({
            success: false,
            message: 'Child not found'
        });
    }

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Get parent app settings
 * @route   GET /api/parent/settings
 * @access  Private (parent)
 */
export const getParentSettingsController = asyncHandler(async (req, res) => {
    const data = await getParentSettings({
        schoolId: req.schoolId,
        parentUser: req.user
    });

    res.status(200).json({
        success: true,
        data
    });
});

/**
 * @desc    Update parent app settings
 * @route   PATCH /api/parent/settings
 * @access  Private (parent)
 */
export const updateParentSettingsController = asyncHandler(async (req, res) => {
    const payload = req.body || {};
    if (payload.notifications != null && typeof payload.notifications !== 'object') {
        return res.status(400).json({
            success: false,
            message: 'notifications must be an object'
        });
    }

    const data = await updateParentSettings({
        schoolId: req.schoolId,
        parentUser: req.user,
        payload
    });

    res.status(200).json({
        success: true,
        data
    });
});
