import { asyncHandler } from '../middleware/errorHandler.js';
import * as configService from '../services/gradebookConfigService.js';
import { DEFAULT_CATEGORIES } from '../models/GradebookConfig.js';

/**
 * GET /api/gradebook-config
 * Get the active gradebook config for the current school.
 * Query params: ?academicYear=2025-2026
 */
export const getConfig = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const { academicYear } = req.query;

    let config;
    if (academicYear) {
        config = await configService.getGradebookConfig(schoolId, academicYear);
    } else {
        config = await configService.getActiveGradebookConfig(schoolId);
    }

    res.json({
        success: true,
        data: config || { semesters: [], categories: DEFAULT_CATEGORIES, gradingPolicy: {}, _isDefault: true }
    });
});

/**
 * GET /api/gradebook-config/categories
 * Get active categories for the school.
 * Query params: ?academicYear=2025-2026
 */
export const getCategories = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const { academicYear } = req.query;

    const categories = await configService.getCategories(schoolId, academicYear);

    res.json({
        success: true,
        data: categories
    });
});

/**
 * POST /api/gradebook-config
 * Create a new gradebook config.
 */
export const createConfig = asyncHandler(async (req, res) => {
    const schoolId = req.schoolId;
    const userId = req.user._id;
    const { academicYear, semesters, categories, gradingPolicy } = req.body;

    if (!academicYear) {
        return res.status(400).json({ success: false, message: 'Academic year is required' });
    }

    // Validate semester dates if provided
    if (Array.isArray(semesters)) {
        for (const sem of semesters) {
            if (!sem.number || !sem.label || !sem.startDate || !sem.endDate) {
                return res.status(400).json({
                    success: false,
                    message: `Semester ${sem.number || '?'}: number, label, startDate, and endDate are required`
                });
            }
            if (new Date(sem.startDate) >= new Date(sem.endDate)) {
                return res.status(400).json({
                    success: false,
                    message: `Semester ${sem.number}: startDate must be before endDate`
                });
            }
            // Validate exam period weights sum ≤ 100
            if (Array.isArray(sem.examPeriods)) {
                const totalExamWeight = sem.examPeriods.reduce((sum, ep) => sum + (Number(ep.weight) || 0), 0);
                if (totalExamWeight > 100) {
                    return res.status(400).json({
                        success: false,
                        message: `Semester ${sem.number}: exam period weights sum to ${totalExamWeight}%, must not exceed 100%`
                    });
                }
                sem.courseworkWeight = 100 - totalExamWeight;
            }
        }
    }

    // Validate categories if provided
    if (Array.isArray(categories)) {
        const keys = categories.map((c) => c.key?.toLowerCase());
        const uniqueKeys = new Set(keys);
        if (uniqueKeys.size !== keys.length) {
            return res.status(400).json({ success: false, message: 'Category keys must be unique' });
        }
    }

    const config = await configService.createGradebookConfig({
        school: schoolId,
        academicYear,
        semesters,
        categories,
        gradingPolicy,
        createdBy: userId
    });

    res.status(201).json({
        success: true,
        data: config
    });
});

/**
 * PUT /api/gradebook-config/:id
 * Update an existing gradebook config.
 */
export const updateConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { semesters, categories, gradingPolicy, isActive } = req.body;

    // Validate semester dates if provided
    if (Array.isArray(semesters)) {
        for (const sem of semesters) {
            if (!sem.number || !sem.label || !sem.startDate || !sem.endDate) {
                return res.status(400).json({
                    success: false,
                    message: `Semester ${sem.number || '?'}: number, label, startDate, and endDate are required`
                });
            }
            if (new Date(sem.startDate) >= new Date(sem.endDate)) {
                return res.status(400).json({
                    success: false,
                    message: `Semester ${sem.number}: startDate must be before endDate`
                });
            }
            if (Array.isArray(sem.examPeriods)) {
                const totalExamWeight = sem.examPeriods.reduce((sum, ep) => sum + (Number(ep.weight) || 0), 0);
                if (totalExamWeight > 100) {
                    return res.status(400).json({
                        success: false,
                        message: `Semester ${sem.number}: exam period weights sum to ${totalExamWeight}%, must not exceed 100%`
                    });
                }
                sem.courseworkWeight = 100 - totalExamWeight;
            }
        }
    }

    if (Array.isArray(categories)) {
        const keys = categories.map((c) => c.key?.toLowerCase());
        const uniqueKeys = new Set(keys);
        if (uniqueKeys.size !== keys.length) {
            return res.status(400).json({ success: false, message: 'Category keys must be unique' });
        }
    }

    const config = await configService.updateGradebookConfig(id, { semesters, categories, gradingPolicy, isActive });

    if (!config) {
        return res.status(404).json({ success: false, message: 'Gradebook config not found' });
    }

    res.json({
        success: true,
        data: config
    });
});

/**
 * POST /api/gradebook-config/:id/clone
 * Clone a config for a new academic year.
 */
export const cloneConfig = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { academicYear } = req.body;
    const userId = req.user._id;

    if (!academicYear) {
        return res.status(400).json({ success: false, message: 'Target academic year is required' });
    }

    const config = await configService.cloneGradebookConfig(id, academicYear, userId);

    if (!config) {
        return res.status(404).json({ success: false, message: 'Source gradebook config not found' });
    }

    res.status(201).json({
        success: true,
        data: config
    });
});
