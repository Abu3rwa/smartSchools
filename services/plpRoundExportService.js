import JSZip from 'jszip';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

const displayDate = (value) => {
    if (!value) return 'Not set';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not set' : new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC' }).format(date);
};

const safeFilename = (value) =>
    String(value || 'student')
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'student';

export const buildPlpRoundReportDocx = async ({ record, goals, tasks }) => {
    const studentName = `${record.student?.firstName || ''} ${record.student?.lastName || ''}`.trim() || 'Student';
    const children = [
        new Paragraph({ text: 'Personal Learning Plan', heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: `Student: ${studentName}`, bold: true })] }),
        new Paragraph(`Class: ${record.class?.name || 'Not set'} · Academic year: ${record.academicYear}`),
        new Paragraph(`Round: ${record.cycle?.title || `Month ${record.month}`} · Record status: ${record.status}`),
        new Paragraph({ text: 'Goals and tasks', heading: HeadingLevel.HEADING_1 }),
    ];

    if (!goals.length) children.push(new Paragraph('No goals recorded.'));
    for (const goal of goals) {
        children.push(new Paragraph({ text: `${goal.goalType}: ${goal.title}`, heading: HeadingLevel.HEADING_2 }));
        if (goal.description) children.push(new Paragraph(`Description: ${goal.description}`));
        if (goal.baselineNote) children.push(new Paragraph(`Baseline: ${goal.baselineNote}`));
        if (goal.successCriteria) children.push(new Paragraph(`Success criteria: ${goal.successCriteria}`));
        if (goal.teacherProgressNote) children.push(new Paragraph(`Teacher progress note: ${goal.teacherProgressNote}`));
        if (goal.targetDate) children.push(new Paragraph(`Target date: ${displayDate(goal.targetDate)}`));
        if (goal.checkInDate) children.push(new Paragraph(`Check-in date: ${displayDate(goal.checkInDate)}`));
        for (const milestone of goal.milestones || []) {
            children.push(new Paragraph({
                text: `Milestone: ${milestone.title} · ${milestone.status}${milestone.targetDate ? ` · due ${displayDate(milestone.targetDate)}` : ''}`,
                bullet: { indent: 360 },
            }));
        }
        children.push(new Paragraph(`Goal status: ${goal.status}`));
        const goalTasks = tasks.filter((task) => String(task.plpGoal) === String(goal._id));
        for (const task of goalTasks) {
            children.push(new Paragraph({
                text: `Task: ${task.title} · ${task.status} · due ${displayDate(task.dueDate)}`,
                bullet: { indent: 360 },
            }));
            if (task.instructions) children.push(new Paragraph({ text: task.instructions, indent: { left: 720 } }));
            if (task.studentCompletionNote) children.push(new Paragraph({ text: `Student work: ${task.studentCompletionNote}`, indent: { left: 720 } }));
            if (task.teacherFeedback) children.push(new Paragraph({ text: `Teacher feedback: ${task.teacherFeedback}`, indent: { left: 720 } }));
        }
    }

    return Packer.toBuffer(new Document({ sections: [{ children }] }));
};

export const buildPlpRoundZip = async ({ records, goals, tasks }) => {
    const zip = new JSZip();
    for (const record of records) {
        const recordGoals = goals.filter((goal) => String(goal.plpRecord) === String(record._id));
        const recordTasks = tasks.filter((task) => String(task.plpRecord) === String(record._id));
        const studentName = `${record.student?.firstName || ''}-${record.student?.lastName || ''}`;
        const filename = `${safeFilename(studentName)}-${safeFilename(record._id)}.docx`;
        zip.file(filename, await buildPlpRoundReportDocx({ record, goals: recordGoals, tasks: recordTasks }));
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};
