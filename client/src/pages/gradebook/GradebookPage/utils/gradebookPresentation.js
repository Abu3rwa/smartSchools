export const getAvailableSubjects = ({ currentClass, subjects }) => {
    if (currentClass?.subjects) {
        return currentClass.subjects.map((item) => item.subject).filter(Boolean);
    }

    return subjects || [];
};

const normalizeCategory = (value) => {
    const rawCategory = value || 'Other';
    return rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1).toLowerCase();
};

export const processGradebookData = ({ students = [], grades = [], selectedCategoryFilter = 'All' }) => {
    const categories = new Set();
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

        const percentage = (grade.marks / grade.maxMarks) * 100;
        data[studentId].categories[category].total += grade.marks;
        data[studentId].categories[category].count += 1;
        data[studentId].categories[category].percentageTotal += percentage;

        data[studentId].overallTotal += percentage;
        data[studentId].overallCount += 1;
    });

    return {
        categories: Array.from(categories).sort(),
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
