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
    TextRun,
    WidthType
} from 'docx';

const COLORS = {
    navy: '1F3A5F',
    teal: '2A7F88',
    paleBlue: 'EAF1F8',
    stripe: 'F4F7FA',
    line: 'D9DEE4',
    white: 'FFFFFF',
    ink: '263238',
    muted: '52606D',
    green: '2E7D32',
    greenSoft: 'E8F3E9',
    amber: '8A5700',
    amberSoft: 'FFF4D9'
};
const GRADE_ORDER = ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'];
const BORDERS = Object.fromEntries(['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].map((side) => [
    side,
    { style: BorderStyle.SINGLE, size: 4, color: COLORS.line }
]));
const translations = {
    en: {
        title: 'Student Spelling Report',
        studentId: 'Student ID',
        currentLevel: 'Current level',
        week: 'Week',
        pending: 'Pending retests',
        overdue: 'Overdue retests',
        original: 'Original tests',
        retests: 'Retests',
        attempts: 'Attempts',
        correct: 'Correct',
        incorrect: 'Incorrect',
        accuracy: 'Accuracy',
        uniqueMissed: 'Unique words ever missed',
        recovery: 'Retest recovery',
        performance: 'Performance by grade',
        grade: 'Grade',
        missedWords: 'Missed words',
        word: 'Word',
        originalIncorrect: 'Original incorrect',
        retestAttempts: 'Retest attempts',
        retestCorrect: 'Retest correct',
        status: 'Status',
        resolved: 'Resolved',
        noData: 'No data',
        noMissedWords: 'No missed words recorded',
        notSet: 'Not set'
    },
    ar: {
        title: 'تقرير إملاء الطالب',
        studentId: 'معرّف الطالب',
        currentLevel: 'المستوى الحالي',
        week: 'الأسبوع',
        pending: 'إعادات الاختبار المعلقة',
        overdue: 'إعادات الاختبار المتأخرة',
        original: 'الاختبارات الأصلية',
        retests: 'إعادات الاختبار',
        attempts: 'المحاولات',
        correct: 'الصحيح',
        incorrect: 'الخطأ',
        accuracy: 'الدقة',
        uniqueMissed: 'الكلمات التي أُخطئ فيها',
        recovery: 'التعافي في الإعادة',
        performance: 'الأداء حسب الصف',
        grade: 'الصف',
        missedWords: 'الكلمات التي أُخطئ فيها',
        word: 'الكلمة',
        originalIncorrect: 'الأخطاء الأصلية',
        retestAttempts: 'محاولات الإعادة',
        retestCorrect: 'الصحيح في الإعادة',
        status: 'الحالة',
        resolved: 'تمت المعالجة',
        noData: 'لا توجد بيانات',
        noMissedWords: 'لا توجد كلمات فائتة مسجلة',
        notSet: 'غير محدد'
    }
};

const makeCell = (value, { header = false, fill, color, bold = false, alignment = AlignmentType.LEFT } = {}) => new TableCell({
    shading: { type: ShadingType.CLEAR, fill: fill || (header ? COLORS.navy : COLORS.white) },
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    children: [new Paragraph({
        alignment,
        children: [new TextRun({
            text: String(value ?? ''),
            bold: header || bold,
            color: color || (header ? COLORS.white : COLORS.ink),
            size: 18,
            font: 'Arial'
        })]
    })]
});

const makeTable = (headers, rows, { statusColumn = -1 } = {}) => {
    const header = new TableRow({
        tableHeader: true,
        children: headers.map((value) => makeCell(value, { header: true }))
    });
    const body = rows.map((row, rowIndex) => new TableRow({
        cantSplit: true,
        children: row.map((value, columnIndex) => {
            let fill = rowIndex % 2 ? COLORS.stripe : COLORS.white;
            let color;
            let bold = false;
            if (columnIndex === statusColumn && (value === translations.en.pending
                || value === translations.ar.pending
                || value === translations.en.resolved
                || value === translations.ar.resolved)) {
                const pending = value === translations.en.pending || value === translations.ar.pending;
                fill = pending ? COLORS.amberSoft : COLORS.greenSoft;
                color = pending ? COLORS.amber : COLORS.green;
                bold = true;
            }
            return makeCell(value, { fill, color, bold });
        })
    }));
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: BORDERS,
        rows: [header, ...body]
    });
};

const heading = (text) => new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 100 },
    children: [new TextRun({ text, color: COLORS.navy, bold: true, size: 24, font: 'Arial' })]
});

const section = (text, children) => [heading(text), ...children];

export async function buildStudentSpellingDetailsDocx(details, { locale = 'en' } = {}) {
    const language = String(locale).toLowerCase().startsWith('ar') ? 'ar' : 'en';
    const words = translations[language];
    const { student, summary, byGrade = [], missedWords = [] } = details;
    const sortedGrades = [...byGrade].sort((a, b) => {
        const aRank = GRADE_ORDER.indexOf(String(a.grade).toUpperCase());
        const bRank = GRADE_ORDER.indexOf(String(b.grade).toUpperCase());
        return (aRank < 0 ? GRADE_ORDER.length : aRank) - (bRank < 0 ? GRADE_ORDER.length : bRank);
    });
    const sortedMissedWords = [...missedWords].sort(
        (a, b) => Number(b.pending) - Number(a.pending)
            || b.originalIncorrectCount - a.originalIncorrectCount
            || String(a.word).localeCompare(String(b.word), language)
    );
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const performanceRows = sortedGrades.map((item) => [
        item.grade,
        item.originalCorrect,
        item.originalIncorrect,
        `${item.accuracy}%`
    ]);
    const missedRows = sortedMissedWords.map((item) => [
        item.word,
        item.grade,
        item.originalIncorrectCount,
        `${item.retestCorrect} / ${item.retestAttempts}`,
        item.pending ? words.pending : words.resolved
    ]);
    const doc = new Document({
        creator: 'ClassHope',
        title: `${words.title}: ${studentName}`,
        description: words.title,
        sections: [{
            properties: {
                page: {
                    size: { width: 11906, height: 16838 },
                    margin: { top: 850, bottom: 850, left: 850, right: 850 }
                }
            },
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                    children: [new TextRun({ text: words.title, bold: true, color: COLORS.teal, size: 22, font: 'Arial' })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                    children: [new TextRun({ text: studentName || words.notSet, bold: true, color: COLORS.navy, size: 32, font: 'Arial' })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 80 },
                    children: [new TextRun({
                        text: `${words.studentId}: ${student.studentId || words.notSet}  |  ${words.currentLevel}: ${student.currentGrade || words.notSet}  |  ${student.currentWeek ? `${words.week} ${student.currentWeek}` : words.notSet}`,
                        color: COLORS.muted,
                        size: 18,
                        font: 'Arial'
                    })]
                }),
                ...section(words.original, [makeTable([words.original, words.attempts, words.correct, words.incorrect, words.accuracy], [
                    ['', summary.originalAttempts, summary.originalCorrect, summary.originalIncorrect, `${summary.originalAccuracy}%`]
                ])]),
                ...section(words.retests, [makeTable([words.retests, words.attempts, words.correct, words.incorrect, words.recovery], [
                    ['', summary.retestAttempts, summary.retestCorrect, summary.retestIncorrect, summary.retestAttempts ? `${summary.retestRecoveryRate}%` : '—']
                ])]),
                ...section(words.pending, [makeTable([words.pending, words.overdue, words.uniqueMissed], [[
                    summary.pendingRetests, summary.overdueRetests, summary.uniqueWordsEverMissed
                ]])]),
                ...section(words.performance, [makeTable(
                    [words.grade, words.correct, words.incorrect, words.accuracy],
                    performanceRows.length ? performanceRows : [[words.noData, '—', '—', '—']]
                )]),
                ...section(words.missedWords, [makeTable(
                    [words.word, words.grade, words.originalIncorrect, words.retestCorrect, words.status],
                    missedRows.length ? missedRows : [[words.noMissedWords, '', '', '', '']],
                    { statusColumn: 4 }
                )])
            ]
        }]
    });
    return Packer.toBuffer(doc);
}
