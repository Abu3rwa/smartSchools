import {
    formatAverageOutOfScale,
    formatPercentageAsAverageOutOfTen,
    getClassCategoryAverage,
    getClassOverallAverage,
    getStudentCategoryAverage,
    getStudentOverallAverage
} from './gradebookPresentation.js';

const escapeCsvValue = (value) => {
    const text = String(value ?? '');
    const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
};

export const buildGradebookCsv = ({
    students = [],
    categories = [],
    categoryScales = {},
    processedData = {},
    className = '',
    academicYear = '',
    subjectName = '',
    monthName = ''
}) => {
    const scaleFor = (category) => categoryScales[category] || 10;
    const headers = ['Student', ...categories.map((category) => `${category} (/${scaleFor(category)})`), 'Overall (/10)'];
    const rows = students.map(student => {
        const studentData = processedData[student._id];
        const categoryAverages = categories.map(category => {
            const average = getStudentCategoryAverage(studentData, category);
            return average === '-' ? '' : formatAverageOutOfScale(average, scaleFor(category));
        });
        const overallAverage = getStudentOverallAverage(studentData);
        return [
            `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            ...categoryAverages,
            overallAverage === '-' ? '' : formatPercentageAsAverageOutOfTen(overallAverage)
        ];
    });

    const classAverages = categories.map(category => {
        const average = getClassCategoryAverage({ students, processedData, category });
        return average === '-' ? '' : formatAverageOutOfScale(average, scaleFor(category));
    });
    const classOverallAverage = getClassOverallAverage({ students, processedData });
    rows.push([
        'Class Average',
        ...classAverages,
        classOverallAverage === '-' ? '' : formatPercentageAsAverageOutOfTen(classOverallAverage)
    ]);

    const metadata = [
        ['Class', className],
        ['Academic Year', academicYear],
        ['Subject', subjectName],
        ['Month', monthName]
    ].filter(([, value]) => value).map(row => row.map(escapeCsvValue));
    const csvRows = [
        ...metadata,
        headers,
        ...rows
    ];

    return `\uFEFF${csvRows.map(row => row.map(escapeCsvValue).join(',')).join('\r\n')}`;
};

export const downloadGradebookCsv = (csv, className = 'gradebook') => {
    const safeClassName = String(className).replace(/[^a-z0-9_-]/gi, '_') || 'gradebook';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeClassName}_gradebook.csv`;
    link.click();
    URL.revokeObjectURL(url);
};
