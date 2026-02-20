import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveAcademicYearDateRangeForRequest } from '../helpers/academicYearScope.js';
import {
    getParentChildren,
    getParentDashboard
} from '../services/parentDashboardService.js';

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

