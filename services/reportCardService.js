import { randomUUID } from 'crypto';
import TraditionalReportCard from '../models/TraditionalReportCard.js';
import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { getActiveGradingScale } from './gradingScaleEngine.js';
import { getFormulas, computeFormulaForStudent } from './formulaEngine.js';

/**
 * Generate a traditional report card for a single student.
 */
export const generateReportCard = async ({
    schoolId,
    studentId,
    classId,
    academicYear,
    periodType,
    periodLabel,
    template = 'classic',
    generatedBy
}) => {
    const [student, classDoc, gradingScale] = await Promise.all([
        Student.findById(studentId).lean(),
        Class.findById(classId).populate('subjects.subject').lean(),
        getActiveGradingScale(schoolId)
    ]);

    if (!student) throw new Error('Student not found');
    if (!classDoc) throw new Error('Class not found');

    const subjectIds = (classDoc.subjects || []).map(s => s.subject?._id || s.subject).filter(Boolean);

    // Determine semester filter based on period
    const semesterFilter = {};
    if (periodType === 'semester_1') semesterFilter.semester = 1;
    else if (periodType === 'semester_2') semesterFilter.semester = 2;

    // Fetch all grades for the student
    const grades = await Grade.find({
        school: schoolId,
        student: studentId,
        class: classId,
        academicYear,
        subject: { $in: subjectIds },
        ...semesterFilter
    }).lean();

    // Group grades by subject
    const gradesBySubject = new Map();
    for (const g of grades) {
        const sid = g.subject.toString();
        if (!gradesBySubject.has(sid)) gradesBySubject.set(sid, []);
        gradesBySubject.get(sid).push(g);
    }

    const letterGradeFor = (pct) => {
        if (!gradingScale?.bands?.length) return '';
        const band = gradingScale.bands.find(b => pct >= b.min && pct <= b.max);
        return band?.grade || '';
    };

    // Build subject grades
    const subjects = [];
    let totalPercent = 0;
    let subjectCount = 0;

    for (const subjectEntry of classDoc.subjects || []) {
        const subjectObj = subjectEntry.subject;
        const subjectId = (subjectObj?._id || subjectObj)?.toString();
        if (!subjectId) continue;

        const sGrades = gradesBySubject.get(subjectId) || [];
        if (sGrades.length === 0) continue;

        // Category breakdown
        const categoryMap = new Map();
        for (const g of sGrades) {
            const cat = g.category || 'other';
            if (!categoryMap.has(cat)) categoryMap.set(cat, { marks: 0, maxMarks: 0 });
            categoryMap.get(cat).marks += g.marks;
            categoryMap.get(cat).maxMarks += g.maxMarks;
        }

        const categoryGrades = [];
        for (const [cat, totals] of categoryMap) {
            const avg = totals.maxMarks > 0 ? (totals.marks / totals.maxMarks) * 100 : 0;
            categoryGrades.push({
                category: cat,
                average: Math.round(avg * 100) / 100,
                letterGrade: letterGradeFor(avg)
            });
        }

        // Overall for this subject
        const totalMarks = sGrades.reduce((s, g) => s + g.marks, 0);
        const totalMaxMarks = sGrades.reduce((s, g) => s + g.maxMarks, 0);
        const overallPct = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;

        // Check for formula-based grades
        const formulas = await getFormulas(schoolId, {
            classId,
            subjectId,
            academicYear,
            semester: semesterFilter.semester
        });

        let midtermGrade = null;
        let finalGrade = null;
        let formulaOverallGrade = null;

        for (const formula of formulas) {
            const result = computeFormulaForStudent(formula, sGrades, gradingScale);
            const gradeObj = {
                score: result.score,
                maxMarks: result.maxMarks,
                percentage: result.percentage,
                letterGrade: result.letterGrade
            };
            if (formula.name.toLowerCase().includes('midterm')) midtermGrade = gradeObj;
            else if (formula.name.toLowerCase().includes('final') && !formula.isFinalGrade) finalGrade = gradeObj;
            if (formula.isFinalGrade) formulaOverallGrade = gradeObj;
        }

        const subjectGrade = {
            subject: subjectId,
            subjectName: subjectObj?.name || subjectObj?.toString() || '',
            categoryGrades,
            midtermGrade,
            finalGrade,
            overallGrade: formulaOverallGrade || {
                score: Math.round(overallPct * 100) / 100,
                maxMarks: 100,
                percentage: Math.round(overallPct * 100) / 100,
                letterGrade: letterGradeFor(overallPct)
            },
            comment: ''
        };

        subjects.push(subjectGrade);
        totalPercent += subjectGrade.overallGrade.percentage;
        subjectCount++;
    }

    const overallAverage = subjectCount > 0 ? Math.round((totalPercent / subjectCount) * 100) / 100 : 0;

    const reportCard = await TraditionalReportCard.create({
        school: schoolId,
        student: studentId,
        class: classId,
        academicYear,
        period: { type: periodType, label: periodLabel || periodType },
        reportCardId: `RC-${randomUUID().slice(0, 8).toUpperCase()}`,
        subjects,
        overallAverage,
        overallGrade: letterGradeFor(overallAverage),
        template,
        generatedBy,
        generatedAt: new Date(),
        status: 'draft'
    });

    return reportCard;
};

/**
 * Generate report cards for all students in a class.
 */
export const generateBulkReportCards = async ({
    schoolId, classId, academicYear, periodType, periodLabel, template, generatedBy
}) => {
    const students = await Student.find({
        school: schoolId,
        currentClass: classId,
        status: 'active'
    }).select('_id').lean();

    const results = { success: 0, failed: 0, errors: [] };

    for (const student of students) {
        try {
            // Check if report card already exists
            const existing = await TraditionalReportCard.findOne({
                school: schoolId,
                student: student._id,
                class: classId,
                academicYear,
                'period.type': periodType
            });
            if (existing) {
                results.failed++;
                results.errors.push({ studentId: student._id, message: 'Report card already exists' });
                continue;
            }

            await generateReportCard({
                schoolId,
                studentId: student._id,
                classId,
                academicYear,
                periodType,
                periodLabel,
                template,
                generatedBy
            });
            results.success++;
        } catch (error) {
            results.failed++;
            results.errors.push({ studentId: student._id, message: error.message });
        }
    }

    return results;
};

/**
 * Get report cards with filters.
 */
export const getReportCards = async (schoolId, filters = {}) => {
    const query = { school: schoolId };
    if (filters.classId) query.class = filters.classId;
    if (filters.studentId) query.student = filters.studentId;
    if (filters.academicYear) query.academicYear = filters.academicYear;
    if (filters.periodType) query['period.type'] = filters.periodType;
    if (filters.status) query.status = filters.status;

    return TraditionalReportCard.find(query)
        .populate('student', 'firstName lastName studentNumber')
        .sort({ createdAt: -1 })
        .lean();
};

/**
 * Get a single report card by ID.
 */
export const getReportCardById = async (reportCardId) => {
    return TraditionalReportCard.findById(reportCardId)
        .populate('student', 'firstName lastName studentNumber photo')
        .populate('subjects.subject', 'name nameAr')
        .lean();
};

/**
 * Publish a report card (make visible to parents).
 */
export const publishReportCard = async (reportCardId) => {
    return TraditionalReportCard.findByIdAndUpdate(
        reportCardId,
        { status: 'published', publishedAt: new Date() },
        { new: true }
    );
};

/**
 * Update report card comments.
 */
export const updateReportCardComments = async (reportCardId, { principalComment, classTeacherComment, subjectComments }) => {
    const rc = await TraditionalReportCard.findById(reportCardId);
    if (!rc) return null;

    if (principalComment !== undefined) rc.principalComment = principalComment;
    if (classTeacherComment !== undefined) rc.classTeacherComment = classTeacherComment;
    if (subjectComments) {
        for (const { subjectId, comment } of subjectComments) {
            const subj = rc.subjects.find(s => s.subject.toString() === subjectId);
            if (subj) subj.comment = comment;
        }
    }
    return rc.save();
};
