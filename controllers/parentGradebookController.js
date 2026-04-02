import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import TraditionalReportCard from '../models/TraditionalReportCard.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveRequestedAcademicYear } from '../utils/academicYear.js';
import { getActiveGradingScale } from '../services/gradingScaleEngine.js';
import { getFormulas, computeFormulaForStudent } from '../services/formulaEngine.js';

/**
 * GET /api/parent/grades/:studentId
 * Parent read-only view of their child's grades.
 */
export const getParentGrades = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { academicYear, semester, subject } = req.query;
    const year = resolveRequestedAcademicYear(academicYear, req.school);

    // Verify parent has access to this student
    const student = await Student.findById(studentId).lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const parentIds = (student.parents || []).map(p => (p.user || p).toString());
    if (!parentIds.includes(req.user._id.toString()) && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized to view this student' });
    }

    const gradeFilter = { school: req.schoolId, student: studentId, academicYear: year };
    if (semester) gradeFilter.semester = Number(semester);
    if (subject) gradeFilter.subject = subject;

    const [grades, gradingScale] = await Promise.all([
        Grade.find(gradeFilter)
            .populate('subject', 'name nameAr')
            .select('subject category marks maxMarks date title columnId publicComment semester')
            .sort({ date: -1 })
            .lean(),
        getActiveGradingScale(req.schoolId)
    ]);

    // Group by subject
    const bySubject = {};
    for (const g of grades) {
        const sName = g.subject?.name || 'Unknown';
        if (!bySubject[sName]) bySubject[sName] = { subjectId: g.subject?._id, grades: [], totalPct: 0, count: 0 };
        bySubject[sName].grades.push({
            category: g.category,
            marks: g.marks,
            maxMarks: g.maxMarks,
            date: g.date,
            title: g.title,
            comment: g.publicComment || '',
            percentage: g.maxMarks > 0 ? Math.round((g.marks / g.maxMarks) * 100 * 100) / 100 : 0
        });
        if (g.maxMarks > 0) {
            bySubject[sName].totalPct += (g.marks / g.maxMarks) * 100;
            bySubject[sName].count++;
        }
    }

    const subjects = Object.entries(bySubject).map(([name, data]) => ({
        subject: name,
        subjectId: data.subjectId,
        average: data.count > 0 ? Math.round((data.totalPct / data.count) * 100) / 100 : 0,
        recentGrades: data.grades.slice(0, 10),
        totalGrades: data.grades.length
    }));

    const overallAvg = grades.length > 0
        ? Math.round((grades.reduce((s, g) => s + (g.maxMarks > 0 ? (g.marks / g.maxMarks) * 100 : 0), 0) / grades.filter(g => g.maxMarks > 0).length) * 100) / 100
        : 0;

    res.json({
        success: true,
        data: {
            studentName: `${student.firstName} ${student.lastName}`,
            overallAverage: overallAvg,
            subjects,
            gradingScale,
            totalGrades: grades.length
        }
    });
});

/**
 * GET /api/parent/progress/:studentId
 * Parent progress dashboard — summary with semester comparisons.
 */
export const getParentProgress = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { academicYear } = req.query;
    const year = resolveRequestedAcademicYear(academicYear, req.school);

    const student = await Student.findById(studentId).lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const parentIds = (student.parents || []).map(p => (p.user || p).toString());
    if (!parentIds.includes(req.user._id.toString()) && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const grades = await Grade.find({
        school: req.schoolId,
        student: studentId,
        academicYear: year
    }).populate('subject', 'name').lean();

    // Semester comparison
    const sem1 = grades.filter(g => g.semester === 1 && g.maxMarks > 0);
    const sem2 = grades.filter(g => g.semester === 2 && g.maxMarks > 0);

    const semAvg = (arr) => arr.length > 0
        ? Math.round((arr.reduce((s, g) => s + (g.marks / g.maxMarks) * 100, 0) / arr.length) * 100) / 100
        : null;

    // Recent grades
    const recent = [...grades]
        .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
        .slice(0, 10)
        .map(g => ({
            subject: g.subject?.name || 'Unknown',
            category: g.category,
            marks: g.marks,
            maxMarks: g.maxMarks,
            percentage: g.maxMarks > 0 ? Math.round((g.marks / g.maxMarks) * 100) : 0,
            date: g.date,
            title: g.title
        }));

    // Subject averages per semester
    const subjectSemMap = {};
    for (const g of grades) {
        if (g.maxMarks <= 0) continue;
        const sName = g.subject?.name || 'Unknown';
        if (!subjectSemMap[sName]) subjectSemMap[sName] = { s1: { total: 0, count: 0 }, s2: { total: 0, count: 0 } };
        const sem = g.semester === 2 ? 's2' : 's1';
        subjectSemMap[sName][sem].total += (g.marks / g.maxMarks) * 100;
        subjectSemMap[sName][sem].count++;
    }

    const subjectComparison = Object.entries(subjectSemMap).map(([name, data]) => ({
        subject: name,
        semester1Avg: data.s1.count > 0 ? Math.round((data.s1.total / data.s1.count) * 100) / 100 : null,
        semester2Avg: data.s2.count > 0 ? Math.round((data.s2.total / data.s2.count) * 100) / 100 : null
    }));

    res.json({
        success: true,
        data: {
            studentName: `${student.firstName} ${student.lastName}`,
            semester1Average: semAvg(sem1),
            semester2Average: semAvg(sem2),
            recentGrades: recent,
            subjectComparison,
            totalGrades: grades.length
        }
    });
});

/**
 * GET /api/parent/report-cards/:studentId
 * Get published report cards for a student (parent view).
 */
export const getParentReportCards = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { academicYear } = req.query;

    const student = await Student.findById(studentId).lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const parentIds = (student.parents || []).map(p => (p.user || p).toString());
    if (!parentIds.includes(req.user._id.toString()) && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const filter = { school: req.schoolId, student: studentId, status: 'published' };
    if (academicYear) filter.academicYear = academicYear;

    const reportCards = await TraditionalReportCard.find(filter)
        .select('period reportCardId overallAverage overallGrade template generatedAt publishedAt subjects.subjectName subjects.overallGrade')
        .sort({ publishedAt: -1 })
        .lean();

    res.json({ success: true, data: reportCards });
});
