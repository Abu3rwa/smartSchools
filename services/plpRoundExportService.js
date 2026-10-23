import JSZip from 'jszip';
import {
    AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, Packer,
    Paragraph, Table, TableCell, TableRow, TextRun, WidthType, PageNumber, TableLayoutType,
} from 'docx';
import { buildPlpReportModel } from './plpReportModel.js';

const ACCENT = '2F9E6F';
const HEADER_FILL = 'E7F4EC';
const RULE = { style: BorderStyle.SINGLE, size: 4, color: 'BFD6C9' };
const BORDERS = {
    top: RULE, bottom: RULE, left: RULE, right: RULE, insideHorizontal: RULE, insideVertical: RULE,
};
const CONTENT_WIDTH = 9360;

const safeFilename = (value) =>
    String(value || 'student')
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'student';

const paragraph = (text, options = {}) => new Paragraph({
    spacing: { after: options.after ?? 80, before: options.before ?? 0 },
    bullet: options.bullet ? { indent: 360 } : undefined,
    indent: options.indentLeft ? { left: options.indentLeft } : undefined,
    children: [new TextRun({
        text: String(text ?? '—'),
        bold: options.bold,
        color: options.color,
        size: options.size ?? 20,
        italics: options.italics,
    })],
});

const labelled = (labelText, value) => paragraph(`${labelText}: ${value || 'Not recorded'}`, { size: 19 });

const heading = (title, level = HeadingLevel.HEADING_1) => new Paragraph({
    text: title,
    heading: level,
    spacing: { before: 240, after: 100 },
});

const cell = (value, { header = false, width, indent = 0 } = {}) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: header ? { fill: HEADER_FILL } : undefined,
    margins: { top: 80, bottom: 80, left: 100 + indent, right: 100 },
    children: String(value ?? '-').split('\n').map((line) => new Paragraph({
        children: [new TextRun({ text: line || '-', bold: header, color: header ? ACCENT : '22333B', size: 19 })],
    })),
});

const table = (headers, rows, weights) => {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const widths = weights.map((weight) => Math.floor((CONTENT_WIDTH * weight) / total));
    return new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: widths,
        borders: BORDERS,
        rows: [
            new TableRow({ tableHeader: true, children: headers.map((headerText, index) => cell(headerText, { header: true, width: widths[index] })) }),
            ...rows.map((row) => new TableRow({
                children: row.map((value, index) => (typeof value === 'object' && value?.text !== undefined
                    ? cell(value.text, { width: widths[index], indent: value.indent })
                    : cell(value, { width: widths[index] }))),
            })),
        ],
    });
};

const goalBlock = (goal) => {
    const children = [heading(goal.title, HeadingLevel.HEADING_2)];
    children.push(paragraph(`${goal.type} · ${goal.status}`, { size: 18, color: '5C6F78', after: 100 }));
    if (goal.description) children.push(labelled('Why this goal', goal.description));
    if (goal.baseline) children.push(labelled('Where the student started', goal.baseline));
    if (goal.successCriteria) children.push(labelled('What success looks like', goal.successCriteria));
    children.push(labelled('Target date', goal.targetDate || 'Not set'));
    if (goal.checkInDate) children.push(labelled('Check-in date', goal.checkInDate));
    for (const milestone of goal.milestones) {
        children.push(paragraph(`${milestone.title} — ${milestone.status}${milestone.targetDate ? ` · due ${milestone.targetDate}` : ''}`, { bullet: true, size: 19 }));
    }
    if (goal.practice.length) {
        children.push(paragraph('Linked practice', { bold: true, before: 100, after: 40 }));
        for (const item of goal.practice) {
            children.push(paragraph(`${item.label}${item.detail ? ` — ${item.detail}` : ''} (${item.kind})`, { bullet: true, size: 19 }));
        }
    }
    if (goal.teacherNote) children.push(labelled('Teacher progress note', goal.teacherNote));
    if (goal.review) children.push(labelled('Last review', `${goal.review}${goal.reviewNote ? ` — ${goal.reviewNote}` : ''}`));

    children.push(paragraph(goal.tasks.length ? 'Tasks' : 'Tasks: none linked yet', { bold: true, before: 100, after: 40 }));
    for (const task of goal.tasks) {
        children.push(paragraph(
            `${task.title} — ${task.status} · due ${task.dueDate || 'not set'}${task.isOverdue ? ' (past due)' : ''}`,
            { bullet: true, size: 19 },
        ));
        if (task.instructions) children.push(paragraph(task.instructions, { indentLeft: 720, size: 18, color: '445761' }));
        if (task.studentNote) children.push(paragraph(`Student work: ${task.studentNote}`, { indentLeft: 720, size: 18, color: '445761' }));
        if (task.feedback) children.push(paragraph(`Teacher feedback: ${task.feedback}`, { indentLeft: 720, size: 18, color: '445761' }));
    }
    return children;
};

export const buildPlpRoundReportDocx = async ({ record, goals, tasks, evidence = [], school = null, practiceItems = [] }) => {
    const model = buildPlpReportModel({
        record,
        goals: goals.filter((goal) => String(goal.plpRecord) === String(record._id)),
        tasks: tasks.filter((task) => String(task.plpRecord) === String(record._id)),
        evidence: evidence.filter((item) => String(item.plpRecord) === String(record._id)),
        school,
        practiceItems,
    });

    const children = [
        new Paragraph({ text: model.reportTitle, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 220 },
            children: [new TextRun({ text: `${model.schoolName} · ${model.period.round} · ${model.period.academicYear}`, size: 20, color: '5C6F78' })],
        }),
        heading('Student information'),
        table(['Field', 'Value'], [
            ['Student', model.student.name],
            ['Student ID', model.student.studentId],
            ['Class', model.student.classLabel],
            ['Form teacher', model.student.teacher],
            ['Round status', model.period.status],
            ['Development level', model.period.level],
            ['Award decision', `${model.period.award}${model.period.awardReason ? ` — ${model.period.awardReason}` : ''}`],
        ], [28, 72]),
        heading('At a glance'),
        table(['Summary', 'This round'], model.metrics.map((metric) => [metric.label, metric.value]), [45, 55]),
    ];

    children.push(heading('Character strengths noticed'));
    children.push(model.traitTally.length
        ? table(['Trait', 'Positive observations'], model.traitTally.map((row) => [row.trait, String(row.count)]), [65, 35])
        : paragraph('No positive observations have been recorded for this round yet.', { italics: true, color: '5C6F78' }));

    children.push(heading('Trait scores'));
    children.push(model.scores.length
        ? table(['Trait', 'Score out of 5'], model.scores.map((row) => [row.trait, row.score.toFixed(1)]), [65, 35])
        : paragraph('No trait scores have been saved for this round.', { italics: true, color: '5C6F78' }));

    children.push(heading('Goals and tasks'));
    if (!model.goals.length && !model.unassignedTasks.length) {
        children.push(paragraph('No goals or tasks have been recorded for this round.', { italics: true, color: '5C6F78' }));
    }
    for (const goal of model.goals) children.push(...goalBlock(goal));
    if (model.unassignedTasks.length) {
        children.push(heading('Tasks without a goal', HeadingLevel.HEADING_2));
        for (const task of model.unassignedTasks) {
            children.push(paragraph(`${task.title} — ${task.status} · due ${task.dueDate || 'not set'}`, { bullet: true, size: 19 }));
        }
    }

    children.push(heading('Observation log'));
    if (model.observations.length) {
        const shown = model.observations.slice(0, 20);
        children.push(table(
            ['Date', 'Trait', 'Type', 'What was seen', 'Recorded by'],
            shown.map((row) => [row.date, row.trait, row.type, row.note, row.teacher]),
            [12, 18, 14, 42, 14],
        ));
        if (model.observations.length > shown.length) {
            children.push(paragraph(`${model.observations.length - shown.length} earlier entries are not printed here; the full log stays in the PLP record.`, { size: 18, color: '5C6F78', before: 80 }));
        }
    } else {
        children.push(paragraph('Nothing has been recorded for this student yet.', { italics: true, color: '5C6F78' }));
    }

    children.push(new Paragraph({
        spacing: { before: 260 },
        children: [new TextRun({
            text: `${model.period.award} for ${model.period.round}. Teacher notes and observation records are for staff use; share with families only when the school's PLP process calls for it.`,
            size: 17,
            italics: true,
            color: '5C6F78',
        })],
    }));

    return Packer.toBuffer(new Document({
        styles: { default: { document: { run: { font: 'Aptos', size: 20 } }, heading1: { run: { font: 'Aptos Display', color: ACCENT, bold: true } } } },
        sections: [{
            headers: { default: new Header({ children: [new Paragraph({ text: model.schoolName, alignment: AlignmentType.RIGHT, children: [new TextRun({ text: model.schoolName, size: 18, color: '5C6F78' })] })] }) },
            footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Page ', size: 18 }), PageNumber.CURRENT, new TextRun({ text: ' of ', size: 18 }), PageNumber.TOTAL_PAGES] })] }) },
            children,
        }],
    }));
};

export const buildPlpRoundZip = async ({ records, goals, tasks, evidence = [], school = null }) => {
    const zip = new JSZip();
    for (const record of records) {
        const studentName = `${record.student?.firstName || ''}-${record.student?.lastName || ''}`;
        const filename = `${safeFilename(studentName)}-${safeFilename(record._id)}.docx`;
        zip.file(filename, await buildPlpRoundReportDocx({ record, goals, tasks, evidence, school }));
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};
