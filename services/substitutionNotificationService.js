import notificationService from './notificationService.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

/**
 * Notification wrapper for substitute teacher notifications.
 * Uses existing notificationService if available; otherwise stubs with console.log + TODO.
 * Do not break builds if email sending fails.
 *
 * @param {Object} params
 * @param {ObjectId} params.teacherId - User._id of substitute teacher
 * @param {ObjectId} params.requestId
 * @param {string} params.message - Principal note + request summary
 * @param {string} params.confirmUrl - Full URL for confirm action
 * @param {string} params.declineUrl - Full URL for decline action
 * @param {ObjectId} params.schoolId
 * @param {ObjectId} params.createdBy - Principal user id (for Gmail sender)
 */
export async function notifySubstituteTeacher({ teacherId, requestId, message, confirmUrl, declineUrl, schoolId, createdBy }) {
    try {
        const teacher = await User.findById(teacherId)
            .select('email firstName lastName')
            .setOptions({ skipTenantFilter: true })
            .lean();

        if (!teacher || !teacher.email) {
            logger.warn(`Substitution: No email for teacher ${teacherId}, skipping notification`);
            return;
        }

        const subject = 'Substitution Request - Action Required';
        const htmlContent = `
<div style="font-family: sans-serif;">
  <h2>Substitution Request</h2>
  <p>${(message || 'You have been selected as a substitute teacher.').replace(/\n/g, '<br>')}</p>
  <p><strong>Please respond by clicking one of the links below:</strong></p>
  <p>
    <a href="${confirmUrl}" style="background:#22c55e;color:white;padding:8px 16px;text-decoration:none;border-radius:4px;margin-right:8px;">Confirm</a>
    <a href="${declineUrl}" style="background:#ef4444;color:white;padding:8px 16px;text-decoration:none;border-radius:4px;">Decline</a>
  </p>
  <p style="color:#666;font-size:12px;">Links expire in 48 hours. Do not share this email.</p>
</div>`;

        if (typeof notificationService.sendEmail === 'function') {
            const Notification = (await import('../models/Notification.js')).default;
            const notification = new Notification({
                school: schoolId,
                recipient: teacherId,
                recipientEmail: teacher.email,
                type: 'custom',
                subject,
                message: message || 'Substitution request - please confirm or decline.',
                htmlContent,
                channels: ['email'],
                metadata: { substitutionRequestId: requestId },
                createdBy
            });
            await notification.save();
            await notificationService.sendEmail(notification, createdBy?.toString?.() || createdBy);
        } else {
            // TODO: Integrate with production notification/email system when available
            logger.info('Substitution notification (stub):', {
                teacherId,
                requestId,
                confirmUrl: confirmUrl?.substring(0, 50) + '...',
                declineUrl: declineUrl?.substring(0, 50) + '...'
            });
        }
    } catch (err) {
        logger.error('Substitution notification error:', err?.message || err);
        // Do not throw - notification failure should not block the request creation
    }
}
