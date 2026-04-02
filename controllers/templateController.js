import { asyncHandler } from '../middleware/errorHandler.js';
import GradebookTemplate from '../models/GradebookTemplate.js';
import GradebookColumn from '../models/GradebookColumn.js';
import GradebookFormula from '../models/GradebookFormula.js';

/**
 * GET /api/gradebook-templates
 * List templates for the school (own + shared).
 */
export const getTemplates = asyncHandler(async (req, res) => {
    const templates = await GradebookTemplate.find({
        school: req.schoolId,
        $or: [{ createdBy: req.user._id }, { isShared: true }]
    })
        .sort({ createdAt: -1 })
        .lean();
    res.json({ success: true, data: templates });
});

/**
 * GET /api/gradebook-templates/:id
 */
export const getTemplate = asyncHandler(async (req, res) => {
    const template = await GradebookTemplate.findOne({
        _id: req.params.id,
        school: req.schoolId
    }).lean();
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, data: template });
});

/**
 * POST /api/gradebook-templates
 * Create a new template.
 */
export const createTemplate = asyncHandler(async (req, res) => {
    const { name, columns, formulas, isShared } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Template name is required' });

    const template = await GradebookTemplate.create({
        school: req.schoolId,
        name: name.trim(),
        columns: columns || [],
        formulas: formulas || [],
        isShared: isShared || false,
        createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: template });
});

/**
 * POST /api/gradebook-templates/from-class
 * Save current class gradebook structure as a template.
 */
export const createTemplateFromClass = asyncHandler(async (req, res) => {
    const { classId, subjectId, academicYear, semester, name, isShared } = req.body;
    if (!classId || !subjectId || !academicYear || !name) {
        return res.status(400).json({ success: false, message: 'classId, subjectId, academicYear, and name are required' });
    }

    const columns = await GradebookColumn.find({
        school: req.schoolId,
        class: classId,
        subject: subjectId,
        academicYear,
        ...(semester ? { semester } : {})
    }).sort({ sortOrder: 1 }).lean();

    const formulas = await GradebookFormula.find({
        school: req.schoolId,
        class: classId,
        subject: subjectId,
        academicYear,
        ...(semester ? { semester } : {})
    }).lean();

    const template = await GradebookTemplate.create({
        school: req.schoolId,
        name: name.trim(),
        columns: columns.map((c, i) => ({
            name: c.name,
            category: c.category,
            maxMarks: c.maxMarks,
            sortOrder: i
        })),
        formulas: formulas.map(f => ({
            name: f.name,
            factors: f.factors.map(fac => ({ category: fac.category, weight: fac.weight })),
            isFinalGrade: f.isFinalGrade
        })),
        isShared: isShared || false,
        createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: template });
});

/**
 * PUT /api/gradebook-templates/:id
 */
export const updateTemplate = asyncHandler(async (req, res) => {
    const template = await GradebookTemplate.findOne({ _id: req.params.id, school: req.schoolId });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

    const { name, columns, formulas, isShared } = req.body;
    if (name !== undefined) template.name = name.trim();
    if (columns !== undefined) template.columns = columns;
    if (formulas !== undefined) template.formulas = formulas;
    if (isShared !== undefined) template.isShared = isShared;

    await template.save();
    res.json({ success: true, data: template });
});

/**
 * DELETE /api/gradebook-templates/:id
 */
export const deleteTemplate = asyncHandler(async (req, res) => {
    const result = await GradebookTemplate.findOneAndDelete({ _id: req.params.id, school: req.schoolId });
    if (!result) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, message: 'Template deleted' });
});

/**
 * POST /api/gradebook-templates/:id/apply
 * Apply a template to a class+subject — creates columns and formulas.
 */
export const applyTemplate = asyncHandler(async (req, res) => {
    const { classId, subjectId, academicYear, semester } = req.body;
    if (!classId || !subjectId || !academicYear || !semester) {
        return res.status(400).json({ success: false, message: 'classId, subjectId, academicYear, and semester are required' });
    }

    const template = await GradebookTemplate.findOne({ _id: req.params.id, school: req.schoolId }).lean();
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

    // Create columns from template
    const columnsData = (template.columns || []).map((c, i) => ({
        school: req.schoolId,
        class: classId,
        subject: subjectId,
        academicYear,
        semester,
        name: c.name,
        category: c.category,
        maxMarks: c.maxMarks || 100,
        sortOrder: i,
        date: new Date(),
        template: template._id,
        createdBy: req.user._id
    }));

    const createdColumns = columnsData.length > 0
        ? await GradebookColumn.insertMany(columnsData, { ordered: false })
        : [];

    // Create formulas from template
    const createdFormulas = [];
    for (const f of template.formulas || []) {
        try {
            const formula = await GradebookFormula.create({
                school: req.schoolId,
                class: classId,
                subject: subjectId,
                academicYear,
                semester,
                name: f.name,
                factors: f.factors,
                isFinalGrade: f.isFinalGrade || false,
                totalMarks: 100,
                createdBy: req.user._id
            });
            createdFormulas.push(formula);
        } catch (err) {
            // Skip duplicate final grade formulas
            if (!err.message?.includes('final grade')) throw err;
        }
    }

    res.status(201).json({
        success: true,
        data: {
            columnsCreated: createdColumns.length,
            formulasCreated: createdFormulas.length
        }
    });
});
