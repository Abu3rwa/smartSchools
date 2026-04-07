import notificationService from '../../services/notificationService.js';
import { resolveConfig } from './worksheetConfigService.js';
import Student from '../../models/Student.js';
import logger from '../../utils/logger.js';
import { NOTIFICATION_TYPES } from '../../constants/notificationTypes.js';

/**
 * Notify teacher that worksheet marking is complete.
 */
export async function notifyTeacherReady(worksheet) {
    try {
        await notificationService.sendNotification({
            schoolId: worksheet.school,
            recipientId: worksheet.teacher,
            type: NOTIFICATION_TYPES.WORKSHEET_MARKED,
            title: 'Worksheet Marking Complete',
            message: `"${worksheet.title}" has been marked. ${worksheet.markedCount}/${worksheet.submissionCount} submissions ready for review.`
        });
    } catch (err) {
        logger.warn('Failed to send teacher notification for worksheet:', err.message);
    }
}

/**
 * Notify students and parents based on the worksheet config.
 */
export async function notifyResults(worksheet, submissions) {
    const config = await resolveConfig(worksheet);

    // Student notifications
    if (config.studentCommunicationEnabled && config.studentViewMode !== 'off') {
        for (const sub of submissions) {
            try {
                const student = await Student.findById(sub.student).populate('user', 'email').lean();
                if (!student?.user) continue;

                await notificationService.sendNotification({
                    schoolId: worksheet.school,
                    recipientId: student.user._id,
                    type: NOTIFICATION_TYPES.WORKSHEET_RESULT,
                    title: 'Worksheet Results Available',
                    message: `Your "${worksheet.title}" worksheet has been marked. Score: ${sub.totalScore}/${sub.maxScore} (${sub.percentage}%)`
                });
            } catch (err) {
                logger.warn(`Failed to notify student ${sub.student}:`, err.message);
            }
        }
    }

    // Parent notifications
    if (config.parentCommunicationEnabled && config.parentViewMode !== 'off') {
        for (const sub of submissions) {
            try {
                const student = await Student.findById(sub.student).lean();
                if (!student?.parentInfo?.email) continue;

                // Check alert threshold
                if (config.parentAlertEnabled && sub.percentage >= config.parentAlertThreshold) {
                    continue; // Only notify parents below threshold when alert mode is on
                }

                await notificationService.sendNotification({
                    schoolId: worksheet.school,
                    recipientEmail: student.parentInfo.email,
                    type: NOTIFICATION_TYPES.WORKSHEET_PARENT_RESULT,
                    title: `${student.firstName}'s Worksheet Results`,
                    message: `${student.firstName} scored ${sub.totalScore}/${sub.maxScore} (${sub.percentage}%) on "${worksheet.title}".`
                });
            } catch (err) {
                logger.warn(`Failed to notify parent for student ${sub.student}:`, err.message);
            }
        }
    }
}

export default { notifyTeacherReady, notifyResults };
