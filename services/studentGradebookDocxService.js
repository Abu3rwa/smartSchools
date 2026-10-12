import {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TableLayoutType,
    TextRun,
    WidthType
} from 'docx';

export const GRADEBOOK_CONTENT_WIDTH_DXA = 9026;
export const GRADEBOOK_COLUMN_WIDTHS_DXA = [1240, 1640, 1160, 800, 1000, 3186];
const INFO_COLUMN_WIDTHS_DXA = [4513, 4513];

const translations = {
    en: {
        title: 'Student Gradebook',
        student: 'Student',
        studentId: 'Student ID',
        subject: 'Subject',
        period: 'Selected period',
        date: 'Date',
        type: 'Assessment',
        score: 'Score',
        percentage: 'Percentage',
        remarks: 'Remarks',
        noGrades: 'No grades recorded for the selected filters.',
        allSubjects: 'All subjects',
        allPeriods: 'All selected periods',
        academicYear: 'Academic year',
        category: 'Category',
        month: 'Month',
        semester: 'Semester',
        startDate: 'From',
        endDate: 'To'
    },
    ar: {
        title: 'سجل درجات الطالب',
        student: 'الطالب',
        studentId: 'رقم الطالب',
        subject: 'المادة',
        period: 'الفترة المحددة',
        date: 'التاريخ',
        type: 'التقييم',
        score: 'الدرجة',
        percentage: 'النسبة المئوية',
        remarks: 'ملاحظات',
        noGrades: 'لا توجد درجات للفلاتر المحددة.',
        allSubjects: 'كل المواد',
        allPeriods: 'كل الفترات المحددة',
        academicYear: 'السنة الأكاديمية',
        category: 'الفئة',
        month: 'الشهر',
        semester: 'الفصل الدراسي',
        startDate: 'من',
        endDate: 'إلى'
    }
};

const borders = Object.fromEntries(['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].map((side) => [
    side,
    { style: BorderStyle.SINGLE, size: 4, color: 'D9DEE4' }
]));

const cell = (value, { header = false, width, fill } = {}) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: fill || (header ? '1F3A5F' : 'FFFFFF') },
    margins: { top: 90, bottom: 90, left: 110, right: 110 },
    children: [new Paragraph({
        children: [new TextRun({
            text: String(value ?? ''),
            bold: header,
            color: header ? 'FFFFFF' : '263238',
            size: 18,
            font: 'Arial'
        })]
    })]
});

const makeTable = (headers, rows, isArabic) => new Table({
    width: { size: GRADEBOOK_CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: GRADEBOOK_COLUMN_WIDTHS_DXA,
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: isArabic,
    borders,
    rows: [
        new TableRow({
            tableHeader: true,
            children: headers.map((header, index) => cell(header, {
                header: true,
                width: GRADEBOOK_COLUMN_WIDTHS_DXA[index]
            }))
        }),
        ...rows.map((row, rowIndex) => new TableRow({
            cantSplit: true,
            children: row.map((value, index) => cell(value, {
                width: GRADEBOOK_COLUMN_WIDTHS_DXA[index],
                fill: rowIndex % 2 === 0 ? 'F3F6FA' : 'FFFFFF'
            }))
        }))
    ]
});

const makeMetadataCell = (label, value, width) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: 'F3F6FA' },
    margins: { top: 90, bottom: 90, left: 110, right: 110 },
    children: [new Paragraph({
        children: [
            new TextRun({ text: `${label}: `, bold: true, color: '1F3A5F', size: 20, font: 'Arial' }),
            new TextRun({ text: String(value ?? ''), color: '263238', size: 20, font: 'Arial' })
        ]
    })]
});

const makeMetadataTable = (studentName, studentId, subject, period, isArabic) => new Table({
    width: { size: GRADEBOOK_CONTENT_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: INFO_COLUMN_WIDTHS_DXA,
    layout: TableLayoutType.FIXED,
    visuallyRightToLeft: isArabic,
    borders,
    rows: [
        new TableRow({
            cantSplit: true,
            children: [
                makeMetadataCell(translations[isArabic ? 'ar' : 'en'].student, studentName, INFO_COLUMN_WIDTHS_DXA[0]),
                makeMetadataCell(translations[isArabic ? 'ar' : 'en'].studentId, studentId, INFO_COLUMN_WIDTHS_DXA[1])
            ]
        }),
        new TableRow({
            cantSplit: true,
            children: [
                makeMetadataCell(translations[isArabic ? 'ar' : 'en'].subject, subject, INFO_COLUMN_WIDTHS_DXA[0]),
                makeMetadataCell(translations[isArabic ? 'ar' : 'en'].period, period, INFO_COLUMN_WIDTHS_DXA[1])
            ]
        })
    ]
});

const displayValue = (value, fallback = '—') => String(value || '').trim() || fallback;

const formatPeriod = (filters, words) => {
    const parts = [];
    if (filters.academicYear) parts.push(`${words.academicYear}: ${filters.academicYear}`);
    if (filters.category) parts.push(`${words.category}: ${filters.category.replace(/_/g, ' ')}`);
    if (filters.month) parts.push(`${words.month}: ${filters.month}`);
    if (filters.semester) parts.push(`${words.semester} ${filters.semester}`);
    if (filters.startDate) parts.push(`${words.startDate}: ${filters.startDate}`);
    if (filters.endDate) parts.push(`${words.endDate}: ${filters.endDate}`);
    return parts.length ? parts.join(' · ') : words.allPeriods;
};

export async function buildStudentGradebookDocx({ student, grades, filters = {}, locale = 'en' }) {
    const language = String(locale).toLowerCase().startsWith('ar') ? 'ar' : 'en';
    const words = translations[language];
    const studentName = [student.firstName, student.lastName].filter(Boolean).join(' ').trim();
    const selectedSubject = filters.subjectName || grades.find((grade) => grade.subject)?.subject?.name;
    const rows = grades.map((grade) => [
        grade.date ? new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(grade.date)) : '—',
        displayValue(grade.subject?.name),
        displayValue(grade.gradeType).replace(/_/g, ' '),
        `${grade.marks} / ${grade.maxMarks}`,
        `${grade.maxMarks > 0 ? Math.round((grade.marks / grade.maxMarks) * 10000) / 100 : 0}%`,
        displayValue(grade.remarks)
    ]);
    const children = [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: words.title, bold: true, color: '1F3A5F', size: 30, font: 'Arial' })]
        }),
        makeMetadataTable(
            studentName || '—',
            displayValue(student.studentId),
            filters.subject ? displayValue(selectedSubject) : words.allSubjects,
            formatPeriod(filters, words),
            language === 'ar'
        ),
        new Paragraph({ spacing: { after: 100 } }),
        makeTable(
            [words.date, words.subject, words.type, words.score, words.percentage, words.remarks],
            rows.length ? rows : [[words.noGrades, '', '', '', '', '']],
            language === 'ar'
        )
    ];
    const doc = new Document({
        creator: 'ClassHope',
        title: `${words.title}: ${studentName || 'Student'}`,
        sections: [{
            properties: {
                page: {
                    size: { width: 11906, height: 16838 },
                    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
                }
            },
            children
        }]
    });
    return Packer.toBuffer(doc);
}
