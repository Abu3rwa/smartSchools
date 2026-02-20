import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveAcademicYearDateRangeForRequest } from '../helpers/academicYearScope.js';
import {
    getParentChildren,
    getParentDashboard,
    getParentUpdates,
    getParentUpdateById
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
