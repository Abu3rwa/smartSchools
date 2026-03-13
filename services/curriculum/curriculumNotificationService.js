import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import logger from '../../utils/logger.js';
import notificationService from '../notificationService.js';

const dedupeUserIds = (userIds = []) => [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];

export const createCurriculumNotificationService = () => ({
    async notifyUsers({
        schoolId,
        userIds = [],
        subject,
        message,
        actorId,
        type = 'custom',
        metadata = {}
    }) {
        const uniqueUserIds = dedupeUserIds(userIds);
        if (!schoolId || uniqueUserIds.length === 0) {
            return { sent: 0 };
        }

        const users = await User.find({
            school: schoolId,
            _id: { $in: uniqueUserIds },
            isActive: true
        }).select('_id email').lean();

        let sent = 0;
        for (const user of users) {
            if (!user?.email) continue;
            const notification = await Notification.create({
                school: schoolId,
                recipient: user._id,
                recipientEmail: user.email,
                type,
                subject,
                message,
                channels: ['email', 'push'],
                status: 'pending',
                createdBy: actorId || null,
                metadata
            });

            try {
                await notificationService.sendEmail(notification, actorId || null);
            } catch (error) {
                logger.warn('curriculum_notification_email_failed', {
                    notificationId: String(notification._id),
                    userId: String(user._id),
                    error: error?.message || String(error)
                });
            }

            sent += 1;
        }

        return { sent };
    }
});

export const curriculumNotificationService = createCurriculumNotificationService();
