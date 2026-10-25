export const getAvailableSubjects = ({ currentClass, subjects }) => {
    const classSubjects = currentClass?.subjects
        ? currentClass.subjects.map((item) => item.subject).filter(Boolean)
        : (subjects || []);

    return classSubjects;
};

const DEFAULT_GRADING_SCALE = [
    { grade: 'A+', min: 97, max: 100, color: '#00f562' },
    { grade: 'A', min: 93, max: 96, color: '#00f562da' },
    { grade: 'A-', min: 90, max: 92, color: '#00f562' },
    { grade: 'B+', min: 87, max: 89, color: '#059669' },
    { grade: 'B', min: 83, max: 86, color: '#0d9488' },
    { grade: 'B-', min: 80, max: 82, color: '#0284c7' },
    
    { grade: 'C+', min: 77, max: 79, color: '#2825eb' },
    { grade: 'C', min: 73, max: 76, color: '#2549eb' },
    { grade: 'C-', min: 70, max: 72, color: '#258beb' },

    { grade: 'D+', min: 67, max: 69, color: '#ecc710' },
    { grade: 'D', min: 50, max: 66, color: '#ecc710' },
    { grade: 'F', min: 0, max: 49, color: '#dc2626' }
];

const MIN_PERCENTAGE = 0;
const MAX_PERCENTAGE = 100;
const EPSILON = 1e-9;

const hasContiguousNonOverlappingBands = (bands) => {
    if (!Array.isArray(bands) || bands.length === 0) {
        return false;
    }

    const firstBand = bands[0];
    const lastBand = bands[bands.length - 1];

    if (firstBand.max < MAX_PERCENTAGE - EPSILON) {
        return false;
    }

    if (lastBand.min > MIN_PERCENTAGE + EPSILON) {
        return false;
    }

    for (let i = 0; i < bands.length; i += 1) {
        const currentBand = bands[i];

        if (currentBand.min > currentBand.max) {
            return false;
        }

        if (i === bands.length - 1) {
            continue;
        }

        const nextBand = bands[i + 1];
        const expectedBoundary = currentBand.min - 1;
        if (Math.abs(nextBand.max - expectedBoundary) > EPSILON) {
            return false;
        }
    }

    return true;
};

export const normalizeGradingScaleBands = (bands = []) => {
    if (!Array.isArray(bands) || bands.length === 0) {
        return DEFAULT_GRADING_SCALE;
    }

    const normalized = bands
        .map((band) => ({
            grade: String(band?.grade || '').trim().toUpperCase(),
            min: Number(band?.min),
            max: Number(band?.max),
            color: String(band?.color || '').trim() || '#64748b'
        }))
        .filter((band) => Number.isFinite(band.min) && Number.isFinite(band.max) && band.grade && band.min >= MIN_PERCENTAGE && band.max <= MAX_PERCENTAGE)
        .sort((a, b) => b.min - a.min || b.max - a.max);

    if (!normalized.length || !hasContiguousNonOverlappingBands(normalized)) {
        return DEFAULT_GRADING_SCALE;
    }

    return normalized;
};

export const getScaleBandForPercentage = (value, gradingScale = null) => {
    const percentage = Number(value);
    if (!Number.isFinite(percentage)) return null;

    const bands = normalizeGradingScaleBands(gradingScale?.bands || gradingScale);
    return bands.find((band) => percentage >= band.min && percentage <= band.max) || null;
};

export const formatAverageOutOfScale = (value, scale = 10) => {
    const average = Number(String(value ?? '').replace('%', '').trim());
    const max = Number(scale);
    if (!Number.isFinite(average) || !Number.isFinite(max) || max <= 0) return '-';
    return String(Number(((average / 100) * max).toFixed(2)));
};

export const formatPercentageAsAverageOutOfTen = (value) => formatAverageOutOfScale(value, 10);

export const normalizeCategory = (value) => {
    const rawCategory = value || 'Other';
    return rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1).toLowerCase();
};

// The scale a category is marked on. Recorded marks win, because that is what the
// teacher actually entered; the school's configured default is the fallback for a
// category whose grades all arrived without a usable maximum.
const resolveCategoryScale = ({ tallies, categoryMaxMarks, category }) => {
    const counts = tallies[category];
    if (counts && counts.size > 0) {
        const [topMax, topCount] = [...counts.entries()].sort(
            (a, b) => b[1] - a[1] || b[0] - a[0]
        )[0];
        if (topCount > 0) return topMax;
    }
    const configured = Number(categoryMaxMarks?.[String(category).toLowerCase()]);
    return Number.isFinite(configured) && configured > 0 ? configured : 10;
};

export const processGradebookData = ({
    students = [],
    grades = [],
    selectedCategoryFilter = 'All',
    categoryMaxMarks = {}
}) => {
    const categories = new Set();
    const maxMarksTallies = {};
    const data = {};

    students.forEach((student) => {
        data[student._id] = {
            info: student,
            categories: {},
            overallTotal: 0,
            overallCount: 0
        };
    });

    grades.forEach((grade) => {
        const category = normalizeCategory(grade.category || grade.gradeType);

        if (selectedCategoryFilter !== 'All' && category !== selectedCategoryFilter) {
            return;
        }

        const studentId = grade.student?._id;
        if (!studentId || !data[studentId]) {
            return;
        }

        categories.add(category);

        if (!data[studentId].categories[category]) {
            data[studentId].categories[category] = { total: 0, count: 0, percentageTotal: 0 };
        }

        if (!maxMarksTallies[category]) maxMarksTallies[category] = new Map();
        const enteredMax = Number(grade.maxMarks);
        if (Number.isFinite(enteredMax) && enteredMax > 0) {
            const tally = maxMarksTallies[category];
            tally.set(enteredMax, (tally.get(enteredMax) || 0) + 1);
        }

        const percentage = (grade.marks / grade.maxMarks) * 100;
        data[studentId].categories[category].total += grade.marks;
        data[studentId].categories[category].count += 1;
        data[studentId].categories[category].percentageTotal += percentage;

        data[studentId].overallTotal += percentage;
        data[studentId].overallCount += 1;
    });

    const categoryScales = {};
    Array.from(categories).forEach((category) => {
        categoryScales[category] = resolveCategoryScale({
            tallies: maxMarksTallies,
            categoryMaxMarks,
            category
        });
    });

    return {
        categories: Array.from(categories).sort(),
        categoryScales,
        data
    };
};

export const getStudentOverallAverage = (studentData) => {
    if (!studentData || studentData.overallCount === 0) {
        return '-';
    }

    return (studentData.overallTotal / studentData.overallCount).toFixed(1);
};

export const getStudentCategoryAverage = (studentData, category) => {
    const categoryData = studentData?.categories?.[category];
    if (!categoryData) {
        return '-';
    }

    return (categoryData.percentageTotal / categoryData.count).toFixed(1);
};

export const getClassCategoryAverage = ({ students = [], processedData = {}, category }) => {
    const validStudents = students.filter((student) => processedData[student._id]?.categories?.[category]);
    if (validStudents.length === 0) {
        return '-';
    }

    const total = validStudents.reduce((sum, student) => {
        const categoryData = processedData[student._id].categories[category];
        return sum + (categoryData.percentageTotal / categoryData.count);
    }, 0);

    return (total / validStudents.length).toFixed(1);
};

export const getClassOverallAverage = ({ students = [], processedData = {} }) => {
    const validStudents = students.filter((student) => processedData[student._id]?.overallCount > 0);
    if (validStudents.length === 0) {
        return '-';
    }

    const total = validStudents.reduce((sum, student) => {
        const studentData = processedData[student._id];
        return sum + (studentData.overallTotal / studentData.overallCount);
    }, 0);

    return `${(total / validStudents.length).toFixed(1)}%`;
};

export const getReportDateForAcademicMonth = ({ academicYear, selectedMonth }) => {
    if (!academicYear) {
        return new Date();
    }

    const [startYear, endYear] = academicYear.split('-').map(Number);
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const targetYear = selectedMonth >= 8 ? startYear : endYear;

    if (selectedMonth === currentMonth && targetYear === currentYear) {
        return new Date();
    }

    const reportDate = new Date(targetYear, selectedMonth, 0);
    reportDate.setHours(23, 59, 59, 999);
    return reportDate;
};

const getAcademicYearDisplayPart = (academicYear) => {
    if (!academicYear) {
        return '';
    }

    const parts = academicYear.split('-').filter(Boolean);
    return parts[1] || parts[0] || '';
};

export const buildPeriodLabel = ({ months, selectedMonth, academicYear }) => {
    const monthLabel = months.find((month) => month.value === selectedMonth)?.label || 'Month';
    const yearPart = getAcademicYearDisplayPart(academicYear);

    return yearPart ? `${monthLabel} ${yearPart}` : monthLabel;
};
