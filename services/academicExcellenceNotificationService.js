import Notification from '../models/Notification.js';
import AcademicExcellenceNotificationPreference from '../models/AcademicExcellenceNotificationPreference.js';
import Student from '../models/Student.js';
import { sendPushToUsers } from './pushNotificationService.js';
import logger from '../utils/logger.js';
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js';

/**
 * Resolve whether a notification should be sent based on the preference cascade:
 * studentOverrides > classOverrides > global > default (true).
 */
const shouldNotify = async ({ schoolId, userId, studentId, classId, type }) => {
    const prefs = await AcademicExcellenceNotificationPreference.findOne({
        school: schoolId,
        user: userId
    }).lean();

    if (!prefs) return true; // no prefs → send by default

    // Check student-level override first
    if (studentId && Array.isArray(prefs.studentOverrides)) {
        const studentOvr = prefs.studentOverrides.find(
            (o) => o.student?.toString() === studentId.toString()
        );
        if (studentOvr && typeof studentOvr[type] === 'boolean') return studentOvr[type];
    }

    // Check class-level override
    if (classId && Array.isArray(prefs.classOverrides)) {
        const classOvr = prefs.classOverrides.find(
            (o) => o.class?.toString() === classId.toString()
        );
        if (classOvr && typeof classOvr[type] === 'boolean') return classOvr[type];
    }

    // Global setting
    if (prefs.global && typeof prefs.global[type] === 'boolean') return prefs.global[type];

    return true;
};

/**
 * Send mastery-level-change notification to student's parents and the student.
 */
const sendMasteryChangeNotification = async ({ schoolId, student, objectiveKey, oldLevel, newLevel, createdBy }) => {
    try {
        const recipients = student.getAllContactEmails ? student.getAllContactEmails() : [];
        if (recipients.length === 0) return null;

        const subject = `Academic Excellence Update – ${student.fullName || student.firstName}`;
        const message = `Objective "${objectiveKey}" mastery changed from ${oldLevel} to ${newLevel}.`;

        const notification = new Notification({
            school: schoolId,
            recipientEmail: recipients.join(','),
            student: student._id,
            type: NOTIFICATION_TYPES.ACADEMIC_EXCELLENCE_MASTERY_CHANGE,
            subject,
            message,
            channels: ['push'],
            metadata: { objectiveKey, oldLevel, newLevel },
            createdBy
        });

        await notification.save();

        // Push notification to parent users
        const parentUserIds = [];
        if (student.parent?.user) parentUserIds.push(student.parent.user);
        if (student.user) parentUserIds.push(student.user);

        if (parentUserIds.length > 0) {
            await sendPushToUsers(parentUserIds, { title: subject, body: message }).catch((err) =>
                logger.warn('ae_push_failed', { error: err?.message })
            );
        }

        return notification;
    } catch (err) {
        logger.error('ae_mastery_change_notification_error', { error: err?.message, student: student?._id });
        return null;
    }
};

/**
 * Send "at risk" alert when a student drops below threshold.
 */
const sendAtRiskNotification = async ({ schoolId, student, notMetCount, threshold, teacherUserId }) => {
    try {
        const subject = `At-Risk Alert – ${student.fullName || student.firstName}`;
        const message = `Student has ${notMetCount} objectives at "not met" level (threshold: ${threshold}).`;

        const notification = new Notification({
            school: schoolId,
            student: student._id,
            type: NOTIFICATION_TYPES.ACADEMIC_EXCELLENCE_AT_RISK,
            subject,
            message,
            channels: ['push'],
            metadata: { notMetCount, threshold }
        });

        await notification.save();

        if (teacherUserId) {
            await sendPushToUsers([teacherUserId], { title: subject, body: message }).catch((err) =>
                logger.warn('ae_at_risk_push_failed', { error: err?.message })
            );
        }

        return notification;
    } catch (err) {
        logger.error('ae_at_risk_notification_error', { error: err?.message, student: student?._id });
        return null;
    }
};

/**
 * Send task assignment notification to a student.
 */
const sendTaskAssignedNotification = async ({ schoolId, student, taskTitle }) => {
    try {
        const subject = `New Practice Task Assigned`;
        const message = `You have a new academic excellence task: "${taskTitle}".`;

        const notification = new Notification({
            school: schoolId,
            student: student._id,
            type: NOTIFICATION_TYPES.ACADEMIC_EXCELLENCE_TASK_ASSIGNED,
            subject,
            message,
            channels: ['push']
        });

        await notification.save();

        if (student.user) {
            await sendPushToUsers([student.user], { title: subject, body: message }).catch(() => {});
        }

        return notification;
    } catch (err) {
        logger.error('ae_task_assigned_notification_error', { error: err?.message });
        return null;
    }
};

export default {
    shouldNotify,
    sendMasteryChangeNotification,
    sendAtRiskNotification,
    sendTaskAssignedNotification
};
