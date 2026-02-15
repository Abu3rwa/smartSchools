import notificationService from './notificationService.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

/**
 * Build rich HTML content for substitution notification email.
 */
function buildEmailHtml({ requestDetails, confirmUrl, declineUrl }) {
    const { date, absentTeacherName, periodDetails, principalNote, materialsLink } = requestDetails || {};

    const periodsRows = (periodDetails || []).map((p) => {
        const gradeClass = p.grade ? `${p.className} (${p.grade})` : p.className;
        return `
        <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;">${p.periodName || '—'}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${p.time || '—'}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${gradeClass || '—'}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${p.subjectName || '—'}</td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${p.roomName || '—'}</td>
        </tr>`;
    }).join('');

    const periodsTable = periodDetails?.length ? `
    <h3 style="margin:16px 0 8px;">Coverage Details</h3>
    <table style="border-collapse:collapse;width:100%;max-width:560px;font-size:14px;">
        <thead>
            <tr style="background:#f3f4f6;">
                <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Period</th>
                <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Time</th>
                <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Class</th>
                <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Subject</th>
                <th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Room</th>
            </tr>
        </thead>
        <tbody>${periodsRows}</tbody>
    </table>` : '';

    const principalSection = principalNote ? `
    <h3 style="margin:16px 0 8px;">Principal Note</h3>
    <p style="margin:0 0 16px;padding:12px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;">${principalNote.replace(/</g, '&lt;')}</p>` : '';

    const materialsSection = materialsLink ? `
    <h3 style="margin:16px 0 8px;">Subbing Materials</h3>
    <p style="margin:0 0 16px;">
        <a href="${materialsLink}" style="color:#3b82f6;text-decoration:underline;">${materialsLink}</a>
    </p>` : '';

    return `
<div style="font-family:sans-serif;color:#374151;max-width:600px;">
  <h2 style="margin:0 0 16px;font-size:20px;">Substitution Request</h2>
  <p style="margin:0 0 8px;">You have been selected as a substitute for <strong>${absentTeacherName || 'a teacher'}</strong> on <strong>${date || 'the scheduled date'}</strong>.</p>
  ${periodsTable}
  ${principalSection}
  ${materialsSection}
  <h3 style="margin:20px 0 8px;">Please respond</h3>
  <p style="margin:0 0 16px;">Click one of the buttons below to confirm or decline:</p>
  <p style="margin:0 0 16px;">
    <a href="${confirmUrl}" style="background:#22c55e;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;margin-right:12px;display:inline-block;">Confirm</a>
    <a href="${declineUrl}" style="background:#ef4444;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">Decline</a>
  </p>
  <p style="color:#6b7280;font-size:12px;margin:24px 0 0;">Links expire in 48 hours. Do not share this email.</p>
</div>`;
}

/**
 * Build plain-text fallback message.
 */
function buildPlainMessage(requestDetails) {
    const { date, absentTeacherName, periodDetails, principalNote, materialsLink } = requestDetails || {};
    let msg = `You have been selected as a substitute for ${absentTeacherName || 'a teacher'} on ${date || 'the scheduled date'}.\n\n`;
    if (periodDetails?.length) {
        msg += 'Coverage details:\n';
        periodDetails.forEach((p) => {
            const gradeClass = p.grade ? `${p.className} (${p.grade})` : p.className;
            msg += `  ${p.periodName}: ${p.time} - ${gradeClass} - ${p.subjectName} - Room ${p.roomName}\n`;
        });
        msg += '\n';
    }
    if (principalNote) msg += `Principal note: ${principalNote}\n\n`;
    if (materialsLink) msg += `Materials: ${materialsLink}\n\n`;
    msg += 'Please confirm or decline using the links in the email.';
    return msg;
}

/**
 * Notification wrapper for substitute teacher notifications.
 * Uses existing notificationService if available; otherwise stubs with console.log + TODO.
 *
 * @param {Object} params
 * @param {ObjectId} params.teacherId - User._id of substitute teacher
 * @param {ObjectId} params.requestId
 * @param {string} [params.message] - Legacy plain message (used if requestDetails absent)
 * @param {Object} [params.requestDetails] - { date, absentTeacherName, periodDetails, principalNote, materialsLink }
 * @param {string} params.confirmUrl
 * @param {string} params.declineUrl
 * @param {ObjectId} params.schoolId
 * @param {ObjectId} params.createdBy
 */
export async function notifySubstituteTeacher({ teacherId, requestId, message, requestDetails, confirmUrl, declineUrl, schoolId, createdBy }) {
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
        const htmlContent = buildEmailHtml({
            requestDetails: requestDetails || { date: '', absentTeacherName: 'Teacher', principalNote: message || '' },
            confirmUrl,
            declineUrl
        });
        const plainMessage = requestDetails ? buildPlainMessage(requestDetails) : (message || 'Substitution request - please confirm or decline.');

        if (typeof notificationService.sendEmail === 'function') {
            const Notification = (await import('../models/Notification.js')).default;
            const notification = new Notification({
                school: schoolId,
                recipient: teacherId,
                recipientEmail: teacher.email,
                type: 'custom',
                subject,
                message: plainMessage,
                htmlContent,
                channels: ['email'],
                metadata: { substitutionRequestId: requestId },
                createdBy
            });
            await notification.save();
            await notificationService.sendEmail(notification, createdBy?.toString?.() || createdBy);
        } else {
            logger.info('Substitution notification (stub):', {
                teacherId,
                requestId,
                requestDetails: !!requestDetails
            });
        }
    } catch (err) {
        logger.error('Substitution notification error:', err?.message || err);
    }
}
