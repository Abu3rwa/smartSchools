import { format } from 'date-fns';

const SUPPORT_THRESHOLD = 60;
const DEFAULT_ACADEMIC_YEAR_START_MONTH = 8;

export const toId = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value._id) return String(value._id);
    return String(value);
};

const toNumeric = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const toPercentage = (marks, maxMarks) => {
    const safeMax = toNumeric(maxMarks);
    if (!safeMax) return null;
    return (toNumeric(marks) / safeMax) * 100;
};

const toFixedLabel = (value) => {
    if (!Number.isFinite(value)) return 'N/A';
    return `${value.toFixed(1)}%`;
};

const gradeTypeLabelMap = {
    classwork: 'Classwork',
    homework: 'Homework',
    quiz: 'Quiz',
    project: 'Project',
    participation: 'Participation',
    monthly_test: 'Test',
    semester_exam: 'Exam',
    daily: 'Daily',
    weekly: 'Weekly',
    other: 'Other'
};

const gradeCategoryLabelMap = {
    classwork: 'Classwork',
    homework: 'Homework',
    quiz: 'Quiz',
    project: 'Project',
    participation: 'Participation',
    test: 'Test',
    exam: 'Exam',
    other: 'Other',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly_test: 'Test',
    semester_exam: 'Exam'
};

export const TREND_CATEGORY_OPTIONS = [
    { value: 'classwork', label: 'Classwork' },
    { value: 'homework', label: 'Homework' },
    { value: 'quiz', label: 'Quiz' },
    { value: 'project', label: 'Project' },
    { value: 'participation', label: 'Participation' },
    { value: 'test', label: 'Test' },
    { value: 'exam', label: 'Exam' },
    { value: 'other', label: 'Other' }
];

export const getGradeTypeLabel = (gradeType) => {
    const key = String(gradeType || '').trim().toLowerCase();
    return gradeTypeLabelMap[key] || 'Grade Entry';
};

export const getGradeCategoryLabel = (category) => {
    const key = String(category || '').trim().toLowerCase();
    return gradeCategoryLabelMap[key] || 'Other';
};

const normalizeGradeCategory = (grade) => {
    const raw = String(grade?.category || grade?.gradeType || 'other').trim().toLowerCase();
    const aliasMap = {
        daily: 'classwork',
        weekly: 'classwork',
        monthly_test: 'test',
        semester_exam: 'exam'
    };
    return aliasMap[raw] || raw;
};

const inAcademicYearRange = (date, academicYear, academicYearStartMonth = DEFAULT_ACADEMIC_YEAR_START_MONTH) => {
    const parsed = getAcademicYearParts(academicYear);
    if (!parsed) return true;

    const parsedStartMonth = Number(academicYearStartMonth);
    const safeStartMonth = Number.isInteger(parsedStartMonth) && parsedStartMonth >= 1 && parsedStartMonth <= 12
        ? parsedStartMonth
        : DEFAULT_ACADEMIC_YEAR_START_MONTH;

    const startDate = new Date(parsed.startYear, safeStartMonth - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(parsed.endYear, safeStartMonth - 1, 1, 0, 0, 0, 0);
    endDate.setDate(endDate.getDate() - 1);
    endDate.setHours(23, 59, 59, 999);

    return date >= startDate && date <= endDate;
};

export const filterAssignmentsForStudent = (assignments = [], studentId) => {
    const safeStudentId = toId(studentId);
    if (!safeStudentId) return [];

    return assignments.filter((assignment) => {
        if (assignment.scope !== 'selected_students') return true;
        return (assignment.studentIds || []).some((id) => toId(id) === safeStudentId);
    });
};

export const buildSubjectPerformanceData = (subjects = []) => {
    return subjects
        .map((subject) => {
            const average = toNumeric(subject.overallAverage);
            return {
                subjectId: toId(subject.subjectId),
                subject: subject.subjectName || subject.subjectCode || 'Unknown',
                average: Number(average.toFixed(2))
            };
        })
        .filter((subject) => Number.isFinite(subject.average) && subject.average > 0)
        .sort((a, b) => b.average - a.average);
};

const collectMonthBuckets = (subjects = []) => {
    const monthBuckets = {};

    subjects.forEach((subject) => {
        const monthlyAverages = subject?.monthlyAverages || {};
        Object.entries(monthlyAverages).forEach(([monthKey, monthData]) => {
            const month = Number(monthKey);
            if (!Number.isFinite(month) || month < 1 || month > 12) return;

            if (!monthBuckets[month]) {
                monthBuckets[month] = [];
            }
            monthBuckets[month].push(toNumeric(monthData.average));
        });
    });

    return monthBuckets;
};

const getAcademicYearParts = (academicYear) => {
    const normalized = String(academicYear || '').trim();
    const match = normalized.match(/^(\d{4})-(\d{4})$/);
    if (!match) return null;

    const startYear = Number(match[1]);
    const endYear = Number(match[2]);
    if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear !== startYear + 1) {
        return null;
    }

    return { startYear, endYear };
};

const getMonthSequenceForAcademicYear = (startMonth) => {
    const parsed = Number(startMonth);
    const safeStartMonth = Number.isInteger(parsed) && parsed >= 1 && parsed <= 12
        ? parsed
        : DEFAULT_ACADEMIC_YEAR_START_MONTH;

    return Array.from({ length: 12 }, (_, index) => ((safeStartMonth - 1 + index) % 12) + 1);
};

export const buildAcademicYearMonthlyTrendData = ({
    subjects = [],
    academicYear = '',
    academicYearStartMonth = DEFAULT_ACADEMIC_YEAR_START_MONTH
} = {}) => {
    const monthBuckets = collectMonthBuckets(subjects);
    const parsedStartMonth = Number(academicYearStartMonth);
    const safeStartMonth = Number.isInteger(parsedStartMonth) && parsedStartMonth >= 1 && parsedStartMonth <= 12
        ? parsedStartMonth
        : DEFAULT_ACADEMIC_YEAR_START_MONTH;
    const academicYearParts = getAcademicYearParts(academicYear);
    const monthSequence = getMonthSequenceForAcademicYear(safeStartMonth);

    return monthSequence.map((monthNumber) => {
        const values = monthBuckets[monthNumber] || [];
        const year = academicYearParts
            ? (monthNumber >= safeStartMonth ? academicYearParts.startYear : academicYearParts.endYear)
            : null;
        const monthLabel = format(new Date(2026, monthNumber - 1, 1), 'MMM');
        const total = values.reduce((sum, value) => sum + value, 0);
        const average = values.length ? total / values.length : null;

        return {
            month: monthLabel,
            monthNumber,
            monthKey: year ? `${year}-${String(monthNumber).padStart(2, '0')}` : String(monthNumber),
            average: Number.isFinite(average) ? Number(average.toFixed(2)) : null
        };
    });
};

export const buildAcademicYearMonthlyTrendFromGrades = ({
    grades = [],
    academicYear = '',
    academicYearStartMonth = DEFAULT_ACADEMIC_YEAR_START_MONTH,
    subjectId = 'all',
    category = 'all'
} = {}) => {
    const parsedStartMonth = Number(academicYearStartMonth);
    const safeStartMonth = Number.isInteger(parsedStartMonth) && parsedStartMonth >= 1 && parsedStartMonth <= 12
        ? parsedStartMonth
        : DEFAULT_ACADEMIC_YEAR_START_MONTH;
    const monthSequence = getMonthSequenceForAcademicYear(safeStartMonth);
    const academicYearParts = getAcademicYearParts(academicYear);

    const monthBuckets = {};
    monthSequence.forEach((month) => {
        monthBuckets[month] = [];
    });

    grades.forEach((grade) => {
        const gradeDate = new Date(grade?.date);
        if (Number.isNaN(gradeDate.getTime())) return;
        if (!inAcademicYearRange(gradeDate, academicYear, safeStartMonth)) return;

        const gradeSubjectId = toId(grade?.subject?._id || grade?.subject);
        if (subjectId !== 'all' && gradeSubjectId !== subjectId) return;

        const gradeCategory = normalizeGradeCategory(grade);
        if (category !== 'all' && gradeCategory !== category) return;

        const percentage = toPercentage(grade?.marks, grade?.maxMarks);
        if (!Number.isFinite(percentage)) return;

        const month = gradeDate.getMonth() + 1;
        if (!monthBuckets[month]) {
            monthBuckets[month] = [];
        }
        monthBuckets[month].push(percentage);
    });

    return monthSequence.map((monthNumber) => {
        const values = monthBuckets[monthNumber] || [];
        const total = values.reduce((sum, value) => sum + value, 0);
        const average = values.length ? total / values.length : null;
        const year = academicYearParts
            ? (monthNumber >= safeStartMonth ? academicYearParts.startYear : academicYearParts.endYear)
            : null;

        return {
            month: format(new Date(2026, monthNumber - 1, 1), 'MMM'),
            monthNumber,
            monthKey: year ? `${year}-${String(monthNumber).padStart(2, '0')}` : String(monthNumber),
            average: Number.isFinite(average) ? Number(average.toFixed(2)) : null,
            entries: values.length
        };
    });
};

export const buildMonthlyTrendData = (input = {}) => {
    const config = Array.isArray(input) ? { subjects: input } : (input || {});
    const rows = Array.isArray(config.grades)
        ? buildAcademicYearMonthlyTrendFromGrades(config)
        : buildAcademicYearMonthlyTrendData(config);

    return rows.map((row) => ({
        month: row.month,
        average: row.average,
        monthNumber: row.monthNumber,
        monthKey: row.monthKey,
        entries: row.entries
    }));
};

export const buildAssignmentRows = ({ assignments = [], grades = [] }) => {
    const gradeByAssignment = new Map();

    grades.forEach((grade) => {
        const assignmentId = toId(grade.assignment);
        if (!assignmentId || gradeByAssignment.has(assignmentId)) return;
        gradeByAssignment.set(assignmentId, grade);
    });

    const assignmentRows = assignments.map((assignment) => {
        const assignmentId = toId(assignment.id || assignment._id);
        const grade = gradeByAssignment.get(assignmentId) || null;
        const percentage = grade ? toPercentage(grade.marks, grade.maxMarks) : null;
        const dueDate = assignment.dueDate || assignment.assignedDate || null;
        const isOverdue = !grade && dueDate ? new Date(dueDate) < new Date() : false;

        return {
            id: `assignment-${assignmentId}`,
            title: assignment.title || assignment.assignmentType?.name || 'Assignment',
            subjectName: assignment.subject?.name || grade?.subject?.name || 'N/A',
            typeLabel: assignment.assignmentType?.name || assignment.assignmentType?.key || 'Assignment',
            dueDate,
            gradedAt: grade?.date || null,
            scoreLabel: grade ? `${grade.marks}/${grade.maxMarks}` : 'Not graded',
            percentage,
            status: grade ? 'Graded' : isOverdue ? 'Overdue' : 'Pending',
            statusTone: grade ? 'success' : isOverdue ? 'danger' : 'warning',
            source: 'assignment'
        };
    });

    const assignmentIds = new Set(assignments.map((assignment) => toId(assignment.id || assignment._id)));
    const standaloneGradeRows = grades
        .filter((grade) => {
            const assignmentId = toId(grade.assignment);
            return !assignmentId || !assignmentIds.has(assignmentId);
        })
        .map((grade) => ({
            id: `grade-${toId(grade._id)}`,
            title: grade.title || getGradeTypeLabel(grade.gradeType),
            subjectName: grade.subject?.name || 'N/A',
            typeLabel: getGradeTypeLabel(grade.gradeType),
            dueDate: null,
            gradedAt: grade.date || null,
            scoreLabel: `${grade.marks}/${grade.maxMarks}`,
            percentage: toPercentage(grade.marks, grade.maxMarks),
            status: 'Recorded',
            statusTone: 'info',
            source: 'grade'
        }));

    const rows = [...assignmentRows, ...standaloneGradeRows];
    rows.sort((a, b) => {
        const dateA = new Date(a.gradedAt || a.dueDate || 0).getTime();
        const dateB = new Date(b.gradedAt || b.dueDate || 0).getTime();
        return dateB - dateA;
    });
    return rows;
};

export const buildOverviewMetrics = ({
    report,
    grades = [],
    subjectPerformanceData = [],
    assignmentRows = []
}) => {
    const reportAverage = toNumeric(report?.overallAverage);
    const gradePercentages = grades
        .map((grade) => toPercentage(grade.marks, grade.maxMarks))
        .filter((value) => Number.isFinite(value));
    const derivedAverage = gradePercentages.length
        ? gradePercentages.reduce((sum, value) => sum + value, 0) / gradePercentages.length
        : 0;

    const hasAverageData = reportAverage > 0 || gradePercentages.length > 0;
    const overallAverage = reportAverage > 0 ? reportAverage : derivedAverage;
    const gradedEntries = grades.length;

    const assignmentOnlyRows = assignmentRows.filter((row) => row.source === 'assignment');
    const gradedAssignments = assignmentOnlyRows.filter((row) => row.status === 'Graded').length;
    const assignmentCompletionRate = assignmentOnlyRows.length
        ? Math.round((gradedAssignments / assignmentOnlyRows.length) * 100)
        : null;

    const bestSubject = subjectPerformanceData.length ? subjectPerformanceData[0].subject : 'N/A';
    const supportSubjects = subjectPerformanceData.filter((subject) => subject.average < SUPPORT_THRESHOLD).length;

    return {
        overallAverage,
        overallAverageLabel: hasAverageData ? toFixedLabel(overallAverage) : 'N/A',
        gradedEntries,
        assignmentCompletionRate,
        assignmentCompletionLabel: assignmentCompletionRate == null
            ? 'N/A'
            : `${assignmentCompletionRate}%`,
        bestSubject,
        supportSubjects
    };
};
