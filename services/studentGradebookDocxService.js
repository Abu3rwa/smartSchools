import {
    AlignmentType,
    BorderStyle,
    Document,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType
} from 'docx';

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

const cell = (value, header = false) => new TableCell({
    shading: { type: ShadingType.CLEAR, fill: header ? '1F3A5F' : 'FFFFFF' },
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

const makeTable = (headers, rows) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
        new TableRow({ tableHeader: true, children: headers.map((header) => cell(header, true)) }),
        ...rows.map((row) => new TableRow({
            cantSplit: true,
            children: row.map((value) => cell(value))
        }))
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
    const metadata = [
        `${words.student}: ${studentName || '—'}`,
        `${words.studentId}: ${displayValue(student.studentId)}`,
        `${words.subject}: ${filters.subject ? displayValue(selectedSubject) : words.allSubjects}`,
        `${words.period}: ${formatPeriod(filters, words)}`
    ];
    const children = [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [new TextRun({ text: words.title, bold: true, color: '1F3A5F', size: 30, font: 'Arial' })]
        }),
        ...metadata.map((text) => new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text, size: 20, font: 'Arial' })]
        })),
        makeTable(
            [words.date, words.subject, words.type, words.score, words.percentage, words.remarks],
            rows.length ? rows : [[words.noGrades, '', '', '', '', '']]
        )
    ];
    const doc = new Document({
        creator: 'ClassHope',
        title: `${words.title}: ${studentName || 'Student'}`,
        sections: [{ children }]
    });
    return Packer.toBuffer(doc);
}
