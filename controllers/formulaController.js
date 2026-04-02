import { asyncHandler } from '../middleware/errorHandler.js';
import * as formulaEngine from '../services/formulaEngine.js';

/**
 * GET /api/gradebook-formulas
 * Get all formulas for a class+subject scope.
 * Query: classId, subjectId, academicYear, semester
 */
export const getFormulas = asyncHandler(async (req, res) => {
    const { classId, subjectId, academicYear, semester } = req.query;
    if (!classId || !subjectId || !academicYear) {
        return res.status(400).json({ success: false, message: 'classId, subjectId, and academicYear are required' });
    }

    const formulas = await formulaEngine.getFormulas(req.schoolId, {
        classId, subjectId, academicYear,
        semester: semester ? Number(semester) : undefined
    });

    res.json({ success: true, data: formulas });
});

/**
 * GET /api/gradebook-formulas/:id
 */
export const getFormula = asyncHandler(async (req, res) => {
    const formula = await formulaEngine.getFormulaById(req.params.id);
    if (!formula) return res.status(404).json({ success: false, message: 'Formula not found' });
    res.json({ success: true, data: formula });
});

/**
 * POST /api/gradebook-formulas
 * Create a new formula.
 */
export const createFormula = asyncHandler(async (req, res) => {
    const { classId, subjectId, academicYear, semester, name, totalMarks, isFinalGrade, factors } = req.body;

    if (!classId || !subjectId || !academicYear || !name || !factors?.length) {
        return res.status(400).json({ success: false, message: 'classId, subjectId, academicYear, name, and factors are required' });
    }

    const weightSum = factors.reduce((s, f) => s + (f.weight || 0), 0);
    if (Math.abs(weightSum - 100) > 0.01) {
        return res.status(400).json({ success: false, message: `Factor weights must sum to 100 (got ${weightSum})` });
    }

    try {
        const formula = await formulaEngine.createFormula({
            school: req.schoolId,
            class: classId,
            subject: subjectId,
            academicYear,
            semester: semester || null,
            name: name.trim(),
            totalMarks: totalMarks || 100,
            isFinalGrade: isFinalGrade || false,
            factors,
            createdBy: req.user._id
        });
        res.status(201).json({ success: true, data: formula });
    } catch (error) {
        if (error.message.includes('final grade formula')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        throw error;
    }
});

/**
 * PUT /api/gradebook-formulas/:id
 */
export const updateFormula = asyncHandler(async (req, res) => {
    const allowedFields = ['name', 'totalMarks', 'isFinalGrade', 'factors', 'semester'];
    const updates = {};
    for (const f of allowedFields) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
    }

    if (updates.factors) {
        const weightSum = updates.factors.reduce((s, f) => s + (f.weight || 0), 0);
        if (Math.abs(weightSum - 100) > 0.01) {
            return res.status(400).json({ success: false, message: `Factor weights must sum to 100 (got ${weightSum})` });
        }
    }

    try {
        const formula = await formulaEngine.updateFormula(req.params.id, updates);
        if (!formula) return res.status(404).json({ success: false, message: 'Formula not found' });
        res.json({ success: true, data: formula });
    } catch (error) {
        if (error.message.includes('final grade formula')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        throw error;
    }
});

/**
 * DELETE /api/gradebook-formulas/:id
 */
export const deleteFormula = asyncHandler(async (req, res) => {
    const formula = await formulaEngine.deleteFormula(req.params.id);
    if (!formula) return res.status(404).json({ success: false, message: 'Formula not found' });
    res.json({ success: true, message: 'Formula deleted' });
});

/**
 * POST /api/gradebook-formulas/:id/calculate
 * Calculate formula results for students.
 * Body: { studentIds } (optional — empty = all)
 */
export const calculateFormula = asyncHandler(async (req, res) => {
    const { studentIds } = req.body;
    const results = await formulaEngine.calculateFormula({
        formulaId: req.params.id,
        studentIds: studentIds || [],
        schoolId: req.schoolId
    });
    res.json({ success: true, data: results });
});

/**
 * GET /api/gradebook-formulas/presets
 * Get formula presets.
 */
export const getPresets = asyncHandler(async (req, res) => {
    res.json({ success: true, data: formulaEngine.FORMULA_PRESETS });
});
