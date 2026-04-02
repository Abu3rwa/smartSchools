import GradebookFormula from '../models/GradebookFormula.js';
import Grade from '../models/Grade.js';
import { getActiveGradingScale, decorateGradesWithScale } from './gradingScaleEngine.js';

/**
 * Calculate a formula result for one or many students.
 *
 * @param {Object} options
 * @param {string} options.formulaId
 * @param {string[]} options.studentIds — if empty, calculates for all students with grades
 * @param {string} options.schoolId
 * @returns {Array<{ studentId, formulaName, score, maxMarks, percentage, letterGrade, breakdown }>}
 */
export const calculateFormula = async ({ formulaId, studentIds, schoolId }) => {
    const formula = await GradebookFormula.findById(formulaId).lean();
    if (!formula) throw new Error('Formula not found');

    // Load all grades for the class+subject+semester
    const gradeFilter = {
        school: schoolId,
        class: formula.class,
        subject: formula.subject,
        academicYear: formula.academicYear
    };
    if (formula.semester) gradeFilter.semester = formula.semester;

    const grades = await Grade.find(gradeFilter).lean();
    const gradingScale = await getActiveGradingScale(schoolId);

    // Group grades by student
    const studentGrades = new Map();
    for (const g of grades) {
        const sid = g.student.toString();
        if (studentIds?.length && !studentIds.includes(sid)) continue;
        if (!studentGrades.has(sid)) studentGrades.set(sid, []);
        studentGrades.get(sid).push(g);
    }

    const results = [];
    for (const [studentId, sGrades] of studentGrades) {
        const result = computeFormulaForStudent(formula, sGrades, gradingScale);
        results.push({ studentId, ...result });
    }

    return results;
};

/**
 * Pure computation: calculate one formula for one student given their grades.
 * Can also be used client-side with the same logic.
 */
export const computeFormulaForStudent = (formula, studentGrades, gradingScale = null) => {
    const breakdown = [];
    let totalWeightedScore = 0;

    for (const factor of formula.factors) {
        let factorGrades;

        if (factor.formulaId) {
            // Nested formula — would need recursive call. For now, skip/placeholder.
            breakdown.push({
                category: `formula:${factor.formulaId}`,
                weight: factor.weight,
                average: 0,
                weightedScore: 0,
                gradeCount: 0,
                note: 'Nested formula — requires recursive calculation'
            });
            continue;
        }

        if (factor.columnIds?.length > 0) {
            // Column-specific: only grades in those columns
            const colSet = new Set(factor.columnIds.map(id => id.toString()));
            factorGrades = studentGrades.filter(g => g.columnId && colSet.has(g.columnId.toString()));
        } else if (factor.category) {
            // Category-based: all grades in that category
            factorGrades = studentGrades.filter(g => g.category === factor.category);
        } else {
            factorGrades = [];
        }

        // Filter out special codes (grades with marks = -1 are excused, etc.)
        const validGrades = factorGrades.filter(g => g.marks >= 0 && g.maxMarks > 0);

        let average = 0;
        if (validGrades.length > 0) {
            const totalMarks = validGrades.reduce((sum, g) => sum + g.marks, 0);
            const totalMaxMarks = validGrades.reduce((sum, g) => sum + g.maxMarks, 0);
            average = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;
        }

        const weightedScore = average * (factor.weight / 100);
        totalWeightedScore += weightedScore;

        breakdown.push({
            category: factor.category || 'all',
            weight: factor.weight,
            average: Math.round(average * 100) / 100,
            weightedScore: Math.round(weightedScore * 100) / 100,
            gradeCount: validGrades.length
        });
    }

    const score = Math.round(totalWeightedScore * (formula.totalMarks / 100) * 100) / 100;
    const percentage = Math.round(totalWeightedScore * 100) / 100;

    // Map to letter grade using grading scale
    let letterGrade = '';
    if (gradingScale?.bands?.length) {
        const band = gradingScale.bands.find(b => percentage >= b.min && percentage <= b.max);
        if (band) letterGrade = band.grade;
    }

    return {
        formulaName: formula.name,
        score,
        maxMarks: formula.totalMarks,
        percentage,
        letterGrade,
        breakdown
    };
};

/**
 * CRUD operations for formulas.
 */
export const getFormulas = async (schoolId, { classId, subjectId, academicYear, semester }) => {
    const filter = { school: schoolId, class: classId, subject: subjectId, academicYear };
    if (semester) filter.semester = semester;
    return GradebookFormula.find(filter).sort({ createdAt: 1 }).lean();
};

export const getFormulaById = async (formulaId) => {
    return GradebookFormula.findById(formulaId).lean();
};

export const createFormula = async (data) => {
    // If isFinalGrade, ensure no other final grade formula exists for the same scope
    if (data.isFinalGrade) {
        const existing = await GradebookFormula.findOne({
            school: data.school,
            class: data.class,
            subject: data.subject,
            academicYear: data.academicYear,
            semester: data.semester || null,
            isFinalGrade: true
        });
        if (existing) {
            throw new Error('A final grade formula already exists for this scope. Remove or update the existing one first.');
        }
    }
    return GradebookFormula.create(data);
};

export const updateFormula = async (formulaId, updates) => {
    const formula = await GradebookFormula.findById(formulaId);
    if (!formula) return null;

    if (updates.isFinalGrade && !formula.isFinalGrade) {
        const existing = await GradebookFormula.findOne({
            school: formula.school,
            class: formula.class,
            subject: formula.subject,
            academicYear: formula.academicYear,
            semester: formula.semester,
            isFinalGrade: true,
            _id: { $ne: formulaId }
        });
        if (existing) {
            throw new Error('A final grade formula already exists for this scope.');
        }
    }

    Object.assign(formula, updates);
    return formula.save();
};

export const deleteFormula = async (formulaId) => {
    return GradebookFormula.findByIdAndDelete(formulaId);
};

/**
 * Common formula presets.
 */
export const FORMULA_PRESETS = {
    simple_average: {
        name: 'Simple Average',
        factors: [{ category: '', weight: 100 }]
    },
    weighted_standard: {
        name: 'Weighted by Category',
        factors: [
            { category: 'test', weight: 40 },
            { category: 'quiz', weight: 25 },
            { category: 'classwork', weight: 20 },
            { category: 'homework', weight: 10 },
            { category: 'participation', weight: 5 }
        ]
    },
    midterm_final: {
        name: 'Midterm + Final',
        factors: [
            { category: 'midterm', weight: 40 },
            { category: 'final', weight: 60 }
        ]
    },
    semester_structure: {
        name: 'Semester Structure',
        factors: [
            { category: 'classwork', weight: 30 },
            { category: 'midterm', weight: 30 },
            { category: 'final', weight: 40 }
        ]
    }
};
