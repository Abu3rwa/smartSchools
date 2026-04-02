import { asyncHandler } from '../middleware/errorHandler.js';
import * as columnService from '../services/gradebookColumnService.js';

/**
 * GET /api/gradebook-columns
 * Get all columns for a class + subject scope.
 * Query params: classId, subjectId, academicYear, semester (optional)
 */
export const getColumns = asyncHandler(async (req, res) => {
    const { classId, subjectId, academicYear, semester } = req.query;

    if (!classId || !subjectId || !academicYear) {
        return res.status(400).json({
            success: false,
            message: 'classId, subjectId, and academicYear are required query parameters'
        });
    }

    const columns = await columnService.getColumns(req.schoolId, {
        classId,
        subjectId,
        academicYear,
        semester: semester ? Number(semester) : undefined
    });

    res.json({ success: true, data: columns });
});

/**
 * GET /api/gradebook-columns/:id
 * Get a single column by ID.
 */
export const getColumn = asyncHandler(async (req, res) => {
    const column = await columnService.getColumnById(req.params.id);
    if (!column) {
        return res.status(404).json({ success: false, message: 'Column not found' });
    }
    res.json({ success: true, data: column });
});

/**
 * POST /api/gradebook-columns
 * Create a new gradebook column.
 */
export const createColumn = asyncHandler(async (req, res) => {
    const { name, category, date, maxMarks, semester, classId, subjectId, academicYear, examPeriod, lessonPlanIds } = req.body;

    if (!name || !category || !classId || !subjectId || !academicYear || !semester) {
        return res.status(400).json({
            success: false,
            message: 'name, category, classId, subjectId, academicYear, and semester are required'
        });
    }

    if (semester !== 1 && semester !== 2) {
        return res.status(400).json({ success: false, message: 'semester must be 1 or 2' });
    }

    // Count existing columns to set sortOrder
    const existingColumns = await columnService.getColumns(req.schoolId, {
        classId, subjectId, academicYear, semester
    });

    const column = await columnService.createColumn({
        school: req.schoolId,
        class: classId,
        subject: subjectId,
        academicYear,
        semester,
        name: name.trim(),
        category: category.toLowerCase().trim(),
        date: date || new Date(),
        maxMarks: maxMarks || 100,
        examPeriod: examPeriod || null,
        lessonPlanIds: lessonPlanIds || [],
        sortOrder: existingColumns.length + 1,
        createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: column });
});

/**
 * PUT /api/gradebook-columns/:id
 * Update a column.
 */
export const updateColumn = asyncHandler(async (req, res) => {
    const allowedFields = ['name', 'category', 'date', 'maxMarks', 'examPeriod', 'isVisible', 'isLocked', 'lessonPlanIds'];
    const updates = {};
    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    }

    if (updates.name) updates.name = updates.name.trim();
    if (updates.category) updates.category = updates.category.toLowerCase().trim();

    try {
        const column = await columnService.updateColumn(req.params.id, updates);
        if (!column) {
            return res.status(404).json({ success: false, message: 'Column not found' });
        }
        res.json({ success: true, data: column });
    } catch (error) {
        if (error.message.includes('locked')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        throw error;
    }
});

/**
 * DELETE /api/gradebook-columns/:id
 * Delete a column. Query: ?deleteGrades=true to also delete associated grades.
 */
export const deleteColumn = asyncHandler(async (req, res) => {
    const deleteGrades = req.query.deleteGrades === 'true';

    try {
        const result = await columnService.deleteColumn(req.params.id, deleteGrades);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Column not found' });
        }
        res.json({
            success: true,
            message: `Column deleted. ${result.gradesUnlinked} grades ${deleteGrades ? 'deleted' : 'unlinked'}.`,
            data: result
        });
    } catch (error) {
        if (error.message.includes('locked')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        throw error;
    }
});

/**
 * PATCH /api/gradebook-columns/reorder
 * Reorder columns. Body: { order: [{ columnId, sortOrder }] }
 */
export const reorderColumns = asyncHandler(async (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
        return res.status(400).json({ success: false, message: 'order array is required' });
    }

    await columnService.reorderColumns(req.schoolId, order);
    res.json({ success: true, message: 'Columns reordered' });
});

/**
 * PATCH /api/gradebook-columns/:id/lock
 * Toggle column lock status.
 */
export const toggleLock = asyncHandler(async (req, res) => {
    const column = await columnService.toggleLock(req.params.id);
    if (!column) {
        return res.status(404).json({ success: false, message: 'Column not found' });
    }
    res.json({ success: true, data: column });
});

/**
 * POST /api/gradebook-columns/migrate
 * Trigger lazy migration of legacy grades to columns for a given scope.
 * Body: { classId, subjectId, academicYear, semester }
 */
export const migrateColumns = asyncHandler(async (req, res) => {
    const { classId, subjectId, academicYear, semester } = req.body;

    if (!classId || !subjectId || !academicYear || !semester) {
        return res.status(400).json({
            success: false,
            message: 'classId, subjectId, academicYear, and semester are required'
        });
    }

    const result = await columnService.migrateColumnsFromLegacyGrades(req.schoolId, {
        classId,
        subjectId,
        academicYear,
        semester: Number(semester),
        userId: req.user._id
    });

    res.json({
        success: true,
        message: result.skipped
            ? 'Migration already completed for this scope'
            : `Created ${result.created} columns, linked ${result.linked} grades`,
        data: result
    });
});
