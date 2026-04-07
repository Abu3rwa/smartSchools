import Grade from '../../models/Grade.js';
import { resolveConfig } from './worksheetConfigService.js';
import logger from '../../utils/logger.js';

/**
 * Record worksheet scores to the traditional gradebook.
 * Uses the existing Grade model — no new models needed.
 */
export async function recordToGradebook(worksheet, submissions, userId) {
    const recorded = [];
    const now = new Date();
    const month = now.getMonth() + 1;

    for (const sub of submissions) {
        if (sub.gradebookRecorded) continue;
        if (sub.status !== 'reviewed' && sub.status !== 'published') continue;

        try {
            const grade = await Grade.create({
                school: worksheet.school,
                student: sub.student,
                subject: worksheet.subject,
                class: worksheet.class,
                teacher: worksheet.teacher,
                academicYear: worksheet.academicYear,
                gradeType: worksheet.gradeCategory || 'classwork',
                category: worksheet.gradeCategory || 'classwork',
                date: now,
                marks: sub.totalScore,
                maxMarks: sub.maxScore,
                month,
                semester: month >= 8 ? 1 : 2,
                title: worksheet.title,
                gradingSource: 'manual'
            });

            sub.gradeRef = grade._id;
            sub.gradebookRecorded = true;
            await sub.save();

            recorded.push({ studentId: sub.student, gradeId: grade._id });
        } catch (err) {
            logger.error(`Failed to record grade for student ${sub.student} on worksheet ${worksheet._id}:`, err.message);
        }
    }

    if (recorded.length > 0) {
        worksheet.gradebookRecordedAt = now;
        await worksheet.save();
    }

    return recorded;
}

/**
 * Unlink worksheet grades from the gradebook.
 */
export async function unlinkFromGradebook(worksheet, submissions) {
    const unlinked = [];

    for (const sub of submissions) {
        if (!sub.gradeRef) continue;

        try {
            await Grade.findByIdAndDelete(sub.gradeRef);
            sub.gradeRef = null;
            sub.gradebookRecorded = false;
            await sub.save();
            unlinked.push(sub.student);
        } catch (err) {
            logger.error(`Failed to unlink grade for student ${sub.student}:`, err.message);
        }
    }

    if (unlinked.length > 0) {
        worksheet.gradebookRecordedAt = null;
        await worksheet.save();
    }

    return unlinked;
}

export default { recordToGradebook, unlinkFromGradebook };
