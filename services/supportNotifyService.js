import Notification from '../models/Notification.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import notificationService from './notificationService.js';

const normalizeEmails = (values = []) => [...new Set(
    (values || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean),
)];

/**
 * Family-visible support update. The parent portal reads Notification rows, so
 * one row per parent email is enough; a push is attempted but never required.
 */
export const notifyParentUpdate = async ({
    schoolId,
    studentId,
    parentEmails = [],
    type,
    subject,
    message,
    htmlContent = '',
    actorId = null,
    metadata = {},
}) => {
    const emails = normalizeEmails(parentEmails);
    if (!schoolId || !studentId || emails.length === 0) return 0;

    const parents = await User.find({
        school: schoolId,
        role: 'parent',
        isActive: true,
        email: { $in: emails },
    }).select('_id email').lean();
    const byEmail = new Map(parents.map((row) => [String(row.email || '').toLowerCase(), row]));

    let created = 0;
    for (const email of emails) {
        const parent = byEmail.get(email);
        const notification = await Notification.create({
            school: schoolId,
            recipient: parent?._id || null,
            recipientEmail: email,
            student: studentId,
            type,
            subject,
            message,
            htmlContent: htmlContent || undefined,
            channels: ['push'],
            status: 'pending',
            priority: 'normal',
            metadata: { ...metadata, createdBy: actorId ? String(actorId) : null },
        });
        created += 1;

        try {
            await notificationService._dispatchParentUpdatePush({
                notification,
                student: { _id: studentId },
                recipientEmails: [email],
                preferredUserIds: parent?._id ? [String(parent._id)] : [],
            });
        } catch (error) {
            logger.warn('support_parent_push_failed', {
                notificationId: String(notification._id),
                error: error?.message || String(error),
            });
        }
    }
    return created;
};
