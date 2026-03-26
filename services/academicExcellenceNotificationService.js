import Notification from '../models/Notification.js';
import AcademicExcellenceNotificationPreference from '../models/AcademicExcellenceNotificationPreference.js';
import School from '../models/School.js';
import User from '../models/User.js';
import { sendPushToUsers } from './pushNotificationService.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';
import { buildPortalLink } from '../helpers/portalUrl.js';
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
            await sendPushToUsers({
                schoolId,
                userIds: parentUserIds,
                title: subject,
                body: message,
                data: { type: 'update', notificationType: NOTIFICATION_TYPES.ACADEMIC_EXCELLENCE_MASTERY_CHANGE },
                collapseKey: 'ae_mastery',
            }).catch((err) =>
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
            await sendPushToUsers({
                schoolId,
                userIds: [teacherUserId],
                title: subject,
                body: message,
                data: { type: 'update', notificationType: NOTIFICATION_TYPES.ACADEMIC_EXCELLENCE_AT_RISK },
                collapseKey: 'ae_at_risk',
            }).catch((err) =>
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
 * Send task assignment notification to a student (push + email) and optionally to parents.
 * Respects school-level settings.notifications.studentNotifications.onTaskAssigned
 * and settings.notifications.parentNotifications.onTaskAssigned.
 */
const sendTaskAssignedNotification = async ({ schoolId, student, taskTitle, taskId }) => {
    try {
        // Load school notification settings
        const school = await School.findById(schoolId).select('settings.notifications').lean();
        const notifSettings = school?.settings?.notifications || {};

        const taskUrl = taskId ? buildPortalLink(`/academic-excellence/tasks/${taskId}`) : '';
        const subject = `New Practice Task Assigned`;
        const message = taskUrl
            ? `You have a new academic excellence task: "${taskTitle}". View: ${taskUrl}`
            : `You have a new academic excellence task: "${taskTitle}".`;
        const htmlContent = [
            `<p>You have a new academic excellence task: <strong>${taskTitle}</strong>.</p>`,
            taskUrl
                ? `<p><a href="${taskUrl}" style="display:inline-block;padding:8px 16px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;">View Task</a></p>`
                : '',
        ].filter(Boolean).join('');

        // ── Student notification ──
        if (notifSettings?.studentNotifications?.onTaskAssigned !== false && student.user) {
            const studentUserId = String(student.user?._id || student.user);
            const studentUser = await User.findById(studentUserId).select('email').lean();
            const studentEmail = studentUser?.email || '';

            const studentNotif = new Notification({
                school: schoolId,
                recipient: studentUserId,
                recipientEmail: studentEmail,
                student: student._id,
                type: NOTIFICATION_TYPES.ACADEMIC_EXCELLENCE_TASK_ASSIGNED,
                subject,
                message,
                htmlContent,
                channels: ['push', ...(studentEmail ? ['email'] : [])],
                metadata: { taskId: taskId || '', taskTitle }
            });
            await studentNotif.save();

            await sendPushToUsers({
                schoolId,
                userIds: [studentUserId],
                title: subject,
                body: message,
                data: { type: 'update', notificationType: NOTIFICATION_TYPES.ACADEMIC_EXCELLENCE_TASK_ASSIGNED, studentId: String(student._id) },
                collapseKey: 'ae_task_assigned',
            }).catch(() => {});

            if (studentEmail) {
                try {
                    await sendTransactionalEmail({
                        to: studentEmail,
                        subject,
                        text: message,
                        html: htmlContent,
                        schoolId,
                    });
                } catch (err) {
                    logger.warn('ae_task_student_email_failed', { error: err?.message });
                }
            }
        }

        // ── Parent notification ──
        if (notifSettings?.parentNotifications?.onTaskAssigned !== false) {
            const parentEmails = typeof student.getAllContactEmails === 'function'
                ? student.getAllContactEmails()
                : [];
            if (parentEmails.length > 0) {
                const parentSubject = `Practice Task Assigned – ${student.fullName || student.firstName}`;
                const parentMessage = taskUrl
                    ? `A new practice task "${taskTitle}" has been assigned to ${student.fullName || student.firstName}. View: ${taskUrl}`
                    : `A new practice task "${taskTitle}" has been assigned to ${student.fullName || student.firstName}.`;
                const parentHtml = [
                    `<p>A new practice task <strong>${taskTitle}</strong> has been assigned to <strong>${student.fullName || student.firstName}</strong>.</p>`,
                    taskUrl
                        ? `<p><a href="${taskUrl}" style="display:inline-block;padding:8px 16px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;">View Task</a></p>`
                        : '',
                ].filter(Boolean).join('');

                const parentNotif = new Notification({
                    school: schoolId,
                    recipientEmail: parentEmails.join(','),
                    student: student._id,
                    type: NOTIFICATION_TYPES.ACADEMIC_EXCELLENCE_TASK_ASSIGNED,
                    subject: parentSubject,
                    message: parentMessage,
                    htmlContent: parentHtml,
                    channels: ['push', 'email'],
                    metadata: { taskId: taskId || '', taskTitle }
                });
                await parentNotif.save();

                // Push to parent user accounts
                const parentUsers = await User.find({
                    school: schoolId,
                    role: 'parent',
                    isActive: true,
                    email: { $in: parentEmails.map(e => e.toLowerCase()) },
                }).select('_id').lean();
                const parentUserIds = parentUsers.map(u => String(u._id));

                if (parentUserIds.length > 0) {
                    await sendPushToUsers({
                        schoolId,
                        userIds: parentUserIds,
                        title: parentSubject,
                        body: parentMessage,
                        data: { type: 'update', notificationType: NOTIFICATION_TYPES.ACADEMIC_EXCELLENCE_TASK_ASSIGNED, studentId: String(student._id) },
                        collapseKey: 'ae_task_assigned_parent',
                    }).catch(() => {});
                }

                // Email parents
                for (const email of parentEmails) {
                    try {
                        await sendTransactionalEmail({
                            to: email,
                            subject: parentSubject,
                            text: parentMessage,
                            html: parentHtml,
                            schoolId,
                        });
                    } catch (err) {
                        logger.warn('ae_task_parent_email_failed', { error: err?.message, email });
                    }
                }
            }
        }

        return true;
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
