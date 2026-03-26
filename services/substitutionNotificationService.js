import notificationService from './notificationService.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUB_REQUEST_TEMPLATE_PATH = path.resolve(__dirname, '../templates/subRequestNotification.html');
let subRequestTemplateCache = null;

async function loadSubRequestTemplate() {
    if (subRequestTemplateCache) return subRequestTemplateCache;
    try {
        subRequestTemplateCache = await readFile(SUB_REQUEST_TEMPLATE_PATH, 'utf8');
        return subRequestTemplateCache;
    } catch (err) {
        logger.warn('Could not load subRequestNotification template. Falling back to inline HTML.');
        return null;
    }
}

function renderTemplate(template, variables = {}) {
    return Object.entries(variables).reduce((output, [key, value]) => {
        const safeValue = value == null ? '' : String(value);
        return output.replaceAll(`{{${key}}}`, safeValue);
    }, template);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Unknown date';
    return d.toLocaleString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function normalizeAction(action) {
    if (action === 'CONFIRM') return 'confirmed';
    if (action === 'DECLINE') return 'declined';
    if (action === 'WITHDRAW') return 'withdrawn';
    return 'updated';
}

async function createAndSendEmailNotification({
    schoolId,
    recipientId,
    recipientEmail,
    subject,
    message,
    htmlContent,
    metadata,
    createdBy
}) {
    if (!recipientEmail) return;
    try {
        const Notification = (await import('../models/Notification.js')).default;
        const notification = new Notification({
            school: schoolId,
            recipient: recipientId || undefined,
            recipientEmail,
            type: 'custom',
            subject,
            message,
            htmlContent,
            channels: ['email'],
            metadata,
            createdBy
        });
        await notification.save();
        if (typeof notificationService.sendEmail === 'function') {
            await notificationService.sendEmail(notification, createdBy?.toString?.() || createdBy || null);
        }
    } catch (err) {
        logger.error('Substitution email notification error:', err?.message || err);
    }
}

async function getAdminPrincipalRecipients({ schoolId, departmentId }) {
    const roleFilters = [{ role: 'admin' }];
    if (departmentId) {
        roleFilters.push({ role: 'department_principal', department: departmentId });
        roleFilters.push({ role: 'department_principal', department: null });
    } else {
        roleFilters.push({ role: 'department_principal' });
    }

    const users = await User.find({
        school: schoolId,
        isActive: true,
        email: { $exists: true, $ne: '' },
        $or: roleFilters
    })
        .select('_id firstName lastName email role')
        .setOptions({ skipTenantFilter: true })
        .lean();

    const seen = new Set();
    return users.filter((u) => {
        const id = String(u._id || '');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

/**
 * Build rich HTML content for substitution notification email.
 */
async function buildEmailHtml({ requestDetails, portalUrl }) {
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
            <tr style="background:#f8fafc;">
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
    <p style="margin:0 0 16px;padding:12px;background:#f8fafc;border-radius:6px;white-space:pre-wrap;">${principalNote.replace(/</g, '&lt;')}</p>` : '';

    const materialsSection = materialsLink ? `
    <h3 style="margin:16px 0 8px;">Subbing Materials</h3>
    <p style="margin:0 0 16px;">
        <a href="${materialsLink}" style="color:#0d9488;text-decoration:underline;">${materialsLink}</a>
    </p>` : '';

        const template = await loadSubRequestTemplate();
        if (!template) {
                return `
<div style="font-family:sans-serif;color:#0f172a;max-width:600px;">
    <h2 style="margin:0 0 16px;font-size:20px;">Substitution Request</h2>
    <p style="margin:0 0 8px;">You have been selected as a substitute for <strong>${absentTeacherName || 'a teacher'}</strong> on <strong>${date || 'the scheduled date'}</strong>.</p>
    ${periodsTable}
    ${principalSection}
    ${materialsSection}
    <h3 style="margin:20px 0 8px;">Action Required</h3>
    <p style="margin:0 0 16px;">Please review the request and respond via the portal:</p>
    <p style="margin:0 0 16px;">
        <a href="${portalUrl}" style="background:#0d9488;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">View & Respond in Portal</a>
    </p>
    <p style="color:#334155;font-size:12px;margin:24px 0 0;">Do not share this email. Access is restricted to your account.</p>
</div>`;
        }

        return renderTemplate(template, {
                absentTeacherName: absentTeacherName || 'a teacher',
                date: date || 'the scheduled date',
                periodsTable,
                principalSection,
                materialsSection,
                portalUrl
        });
}

/**
 * Build plain-text fallback message.
 */
function buildPlainMessage(requestDetails, portalUrl) {
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
    msg += `Please review and respond in the portal: ${portalUrl}`;
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
 * @param {string} params.portalUrl
 * @param {ObjectId} params.schoolId
 * @param {ObjectId} params.createdBy
 */
export async function notifySubstituteTeacher({ teacherId, requestId, message, requestDetails, portalUrl, schoolId, createdBy }) {
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
        const htmlContent = await buildEmailHtml({
            requestDetails: requestDetails || { date: '', absentTeacherName: 'Teacher', principalNote: message || '' },
            portalUrl
        });
        const plainMessage = buildPlainMessage(requestDetails, portalUrl);

        await createAndSendEmailNotification({
            schoolId,
            recipientId: teacherId,
            recipientEmail: teacher.email,
            subject,
            message: plainMessage,
            htmlContent,
            metadata: { substitutionRequestId: requestId, event: 'sub_request_created' },
            createdBy
        });
    } catch (err) {
        logger.error('Substitution notification error:', err?.message || err);
    }
}

export async function notifyTeacherPortalResponse({
    schoolId,
    teacherId,
    requestId,
    action,
    date,
    periodSummaries = [],
    note,
    createdBy
}) {
    const teacher = await User.findById(teacherId)
        .select('email firstName lastName')
        .setOptions({ skipTenantFilter: true })
        .lean();

    if (!teacher?.email) return;

    const verb = normalizeAction(action);
    const periodLines = periodSummaries.length
        ? periodSummaries.map((line) => `- ${line}`).join('\n')
        : '- Assignment details are available in the portal.';
    const plainMessage = [
        `Your substitution response was recorded successfully.`,
        `Status: ${verb}`,
        `Request date: ${formatDate(date)}`,
        'Periods:',
        periodLines,
        note ? `Note: ${note}` : null
    ].filter(Boolean).join('\n');

    const htmlContent = `
<div style="font-family:sans-serif;color:#0f172a;max-width:620px;">
  <h2 style="margin:0 0 12px;">Substitution Response Recorded</h2>
  <p style="margin:0 0 12px;">Your response has been recorded as <strong>${escapeHtml(verb)}</strong>.</p>
  <p style="margin:0 0 16px;">Request date: <strong>${escapeHtml(formatDate(date))}</strong></p>
  <h3 style="margin:0 0 8px;">Periods</h3>
  <ul style="margin:0 0 16px;padding-left:18px;">
    ${(periodSummaries.length ? periodSummaries : ['Assignment details are available in the portal.'])
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join('')}
  </ul>
  ${note ? `<p style="margin:0 0 8px;"><strong>Your note:</strong> ${escapeHtml(note)}</p>` : ''}
</div>`;

    await createAndSendEmailNotification({
        schoolId,
        recipientId: teacherId,
        recipientEmail: teacher.email,
        subject: 'Substitution Response Confirmation',
        message: plainMessage,
        htmlContent,
        metadata: { substitutionRequestId: requestId, event: 'teacher_portal_response', action },
        createdBy
    });
}

export async function notifySubRequestStakeholders({
    schoolId,
    departmentId,
    createdBy,
    requestId,
    subject,
    message,
    htmlContent,
    metadata = {}
}) {
    const recipients = await getAdminPrincipalRecipients({ schoolId, departmentId });
    if (!recipients.length) return;

    await Promise.all(
        recipients.map((recipient) => createAndSendEmailNotification({
            schoolId,
            recipientId: recipient._id,
            recipientEmail: recipient.email,
            subject,
            message,
            htmlContent,
            metadata: { substitutionRequestId: requestId, ...metadata },
            createdBy
        }))
    );
}
