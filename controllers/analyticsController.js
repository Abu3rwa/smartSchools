import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveRequestedAcademicYear } from '../utils/academicYear.js';
import { getActiveGradingScale } from '../services/gradingScaleEngine.js';

/**
 * GET /api/analytics/student/:studentId
 * Student-level analytics: trends, category breakdown, subject comparison.
 */
export const getStudentAnalytics = asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    const { academicYear, semester } = req.query;
    const year = resolveRequestedAcademicYear(academicYear, req.school);

    const gradeFilter = { school: req.schoolId, student: studentId, academicYear: year };
    if (semester) gradeFilter.semester = Number(semester);

    const [grades, gradingScale] = await Promise.all([
        Grade.find(gradeFilter).populate('subject', 'name nameAr').lean(),
        getActiveGradingScale(req.schoolId)
    ]);

    // Monthly trend
    const monthlyTrend = {};
    const subjectBreakdown = {};
    const categoryBreakdown = {};

    for (const g of grades) {
        if (g.maxMarks <= 0) continue;
        const pct = (g.marks / g.maxMarks) * 100;
        const month = g.date ? new Date(g.date).getMonth() + 1 : (g.month || 0);
        const subjectName = g.subject?.name || g.subject?.toString() || 'Unknown';
        const cat = g.category || 'other';

        // Monthly
        if (!monthlyTrend[month]) monthlyTrend[month] = { totalPct: 0, count: 0 };
        monthlyTrend[month].totalPct += pct;
        monthlyTrend[month].count++;

        // Subject
        if (!subjectBreakdown[subjectName]) subjectBreakdown[subjectName] = { totalPct: 0, count: 0 };
        subjectBreakdown[subjectName].totalPct += pct;
        subjectBreakdown[subjectName].count++;

        // Category
        if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { totalPct: 0, count: 0 };
        categoryBreakdown[cat].totalPct += pct;
        categoryBreakdown[cat].count++;
    }

    const trend = Object.entries(monthlyTrend)
        .map(([month, data]) => ({ month: Number(month), average: Math.round((data.totalPct / data.count) * 100) / 100 }))
        .sort((a, b) => a.month - b.month);

    const subjects = Object.entries(subjectBreakdown)
        .map(([name, data]) => ({ subject: name, average: Math.round((data.totalPct / data.count) * 100) / 100, gradeCount: data.count }));

    const categories = Object.entries(categoryBreakdown)
        .map(([cat, data]) => ({ category: cat, average: Math.round((data.totalPct / data.count) * 100) / 100, gradeCount: data.count }));

    const overallAvg = grades.length > 0
        ? Math.round((grades.reduce((s, g) => s + (g.maxMarks > 0 ? (g.marks / g.maxMarks) * 100 : 0), 0) / grades.length) * 100) / 100
        : 0;

    res.json({
        success: true,
        data: { overallAverage: overallAvg, trend, subjects, categories, totalGrades: grades.length, gradingScale }
    });
});

/**
 * GET /api/analytics/class/:classId
 * Class-level analytics: distribution, averages, top/bottom students.
 */
export const getClassAnalytics = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { subject, academicYear, semester } = req.query;
    const year = resolveRequestedAcademicYear(academicYear, req.school);

    const gradeFilter = { school: req.schoolId, class: classId, academicYear: year };
    if (subject) gradeFilter.subject = subject;
    if (semester) gradeFilter.semester = Number(semester);

    const [grades, students, gradingScale] = await Promise.all([
        Grade.find(gradeFilter).lean(),
        Student.find({ school: req.schoolId, currentClass: classId, status: 'active' })
            .select('firstName lastName studentNumber').lean(),
        getActiveGradingScale(req.schoolId)
    ]);

    // Per-student averages
    const studentGrades = new Map();
    for (const g of grades) {
        if (g.maxMarks <= 0) continue;
        const sid = g.student.toString();
        if (!studentGrades.has(sid)) studentGrades.set(sid, { totalPct: 0, count: 0 });
        const data = studentGrades.get(sid);
        data.totalPct += (g.marks / g.maxMarks) * 100;
        data.count++;
    }

    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const studentAverages = [];
    for (const [sid, data] of studentGrades) {
        const s = studentMap.get(sid);
        studentAverages.push({
            studentId: sid,
            name: s ? `${s.firstName} ${s.lastName}` : 'Unknown',
            average: Math.round((data.totalPct / data.count) * 100) / 100,
            gradeCount: data.count
        });
    }
    studentAverages.sort((a, b) => b.average - a.average);

    // Grade distribution (letter grade bands)
    const distribution = {};
    if (gradingScale?.bands) {
        for (const band of gradingScale.bands) {
            distribution[band.grade] = 0;
        }
    }
    for (const { average } of studentAverages) {
        if (gradingScale?.bands) {
            const band = gradingScale.bands.find(b => average >= b.min && average <= b.max);
            if (band) distribution[band.grade]++;
        }
    }

    // Category averages
    const categoryMap = new Map();
    for (const g of grades) {
        if (g.maxMarks <= 0) continue;
        const cat = g.category || 'other';
        if (!categoryMap.has(cat)) categoryMap.set(cat, { totalPct: 0, count: 0 });
        const data = categoryMap.get(cat);
        data.totalPct += (g.marks / g.maxMarks) * 100;
        data.count++;
    }
    const categoryAverages = [...categoryMap.entries()]
        .map(([cat, data]) => ({ category: cat, average: Math.round((data.totalPct / data.count) * 100) / 100 }));

    const classAverage = studentAverages.length > 0
        ? Math.round((studentAverages.reduce((s, sa) => s + sa.average, 0) / studentAverages.length) * 100) / 100
        : 0;

    res.json({
        success: true,
        data: {
            classAverage,
            totalStudents: students.length,
            studentsWithGrades: studentGrades.size,
            distribution,
            categoryAverages,
            topStudents: studentAverages.slice(0, 5),
            bottomStudents: studentAverages.slice(-5).reverse(),
            allStudentAverages: studentAverages
        }
    });
});

/**
 * GET /api/analytics/school
 * School-level analytics: class comparison, at-risk students, grade completeness.
 */
export const getSchoolAnalytics = asyncHandler(async (req, res) => {
    const { academicYear, semester } = req.query;
    const year = resolveRequestedAcademicYear(academicYear, req.school);

    const gradeFilter = { school: req.schoolId, academicYear: year };
    if (semester) gradeFilter.semester = Number(semester);

    const [grades, classes, students] = await Promise.all([
        Grade.find(gradeFilter).select('class student marks maxMarks category').lean(),
        Class.find({ school: req.schoolId, academicYear: year, status: 'active' }).select('name grade').lean(),
        Student.find({ school: req.schoolId, status: 'active', academicYear: year }).select('currentClass').lean()
    ]);

    const classMap = new Map(classes.map(c => [c._id.toString(), c]));
    const studentsPerClass = new Map();
    for (const s of students) {
        const cid = s.currentClass?.toString();
        if (cid) studentsPerClass.set(cid, (studentsPerClass.get(cid) || 0) + 1);
    }

    // Per-class averages
    const classGrades = new Map();
    const studentOverall = new Map();

    for (const g of grades) {
        if (g.maxMarks <= 0) continue;
        const pct = (g.marks / g.maxMarks) * 100;
        const cid = g.class.toString();
        const sid = g.student.toString();

        if (!classGrades.has(cid)) classGrades.set(cid, { totalPct: 0, count: 0 });
        classGrades.get(cid).totalPct += pct;
        classGrades.get(cid).count++;

        if (!studentOverall.has(sid)) studentOverall.set(sid, { totalPct: 0, count: 0, classId: cid });
        studentOverall.get(sid).totalPct += pct;
        studentOverall.get(sid).count++;
    }

    const classComparison = [];
    for (const [cid, data] of classGrades) {
        const cls = classMap.get(cid);
        classComparison.push({
            classId: cid,
            className: cls?.name || 'Unknown',
            grade: cls?.grade,
            average: Math.round((data.totalPct / data.count) * 100) / 100,
            totalStudents: studentsPerClass.get(cid) || 0
        });
    }
    classComparison.sort((a, b) => b.average - a.average);

    // At-risk students (below 50%)
    const atRisk = [];
    for (const [sid, data] of studentOverall) {
        const avg = data.totalPct / data.count;
        if (avg < 50) {
            atRisk.push({ studentId: sid, average: Math.round(avg * 100) / 100, classId: data.classId });
        }
    }

    res.json({
        success: true,
        data: {
            classComparison,
            atRiskCount: atRisk.length,
            atRiskStudents: atRisk.slice(0, 20),
            totalClasses: classes.length,
            totalStudents: students.length,
            totalGrades: grades.length
        }
    });
});
