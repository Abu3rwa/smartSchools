import { AlignmentType, Document, HeadingLevel, Paragraph, Packer, Table, TableCell, TableRow, TextRun } from 'docx';
import { asyncHandler } from '../middleware/errorHandler.js';
import { buildClassSpellingReport, buildSpellingDashboard, buildStudentSpellingReport } from '../services/spellingReportService.js';

const cell = (value) => new TableCell({ children: [new Paragraph(String(value ?? ''))] });
const reportTable = (headers, rows) => new Table({
    rows: [
        new TableRow({ children: headers.map((header) => cell(header)) }),
        ...rows.map((row) => new TableRow({ children: row.map(cell) }))
    ]
});

const sendDocx = async (res, filename, title, tables) => {
    const doc = new Document({ sections: [{ children: [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        ...tables
    ] }] });
    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
};

export const spellingDashboard = asyncHandler(async (req, res) => {
    const data = await buildSpellingDashboard({ schoolId: req.schoolId, classId: req.query.classId });
    return res.json({ success: true, data });
});

export const studentSpellingDocx = asyncHandler(async (req, res) => {
    const data = await buildStudentSpellingReport({ schoolId: req.schoolId, studentId: req.params.studentId });
    if (!data.student) return res.status(404).json({ success: false, message: 'Student not found' });
    const rows = data.sessions.map((session) => [
        new Date(session.startedAt).toLocaleDateString(),
        session.mode,
        session.correctCount,
        session.mistakeCount,
        session.status
    ]);
    const safeName = `${data.student.firstName}-${data.student.lastName}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return sendDocx(res, `spelling-${safeName}.docx`, `Spelling Report: ${data.student.firstName} ${data.student.lastName}`, [
        reportTable(['Date', 'Mode', 'Correct', 'Incorrect', 'Status'], rows.length ? rows : [['No sessions', '', '', '', '']]),
        new Paragraph({ children: [new TextRun(`Pending retests: ${data.retests.length}`)] })
    ]);
});

export const classSpellingDocx = asyncHandler(async (req, res) => {
    const data = await buildClassSpellingReport({ schoolId: req.schoolId, classId: req.params.classId });
    if (!data.class) return res.status(404).json({ success: false, message: 'Class not found' });
    const rows = data.rows.map((row) => [`${row.firstName} ${row.lastName}`, row.sessions, row.correct, row.incorrect, `${row.accuracy}%`]);
    return sendDocx(res, `spelling-class-${req.params.classId}.docx`, `Spelling Report: ${data.class.name}`, [
        reportTable(['Student', 'Sessions', 'Correct', 'Incorrect', 'Accuracy'], rows)
    ]);
});
