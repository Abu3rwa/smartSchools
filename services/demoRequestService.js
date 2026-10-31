import User from '../models/User.js';
import logger from '../utils/logger.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateDemoRequestPayload = (body = {}) => {
    const errors = [];
    const name = String(body.name ?? '').trim();
    const schoolName = String(body.schoolName ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim();
    const role = String(body.role ?? '').trim();
    const message = String(body.message ?? '').trim();

    if (!name) errors.push('name');
    if (name.length > 120) errors.push('name');
    if (!schoolName) errors.push('schoolName');
    if (schoolName.length > 160) errors.push('schoolName');
    if (!email || !EMAIL_PATTERN.test(email) || email.length > 254) errors.push('email');
    if (phone.length > 40) errors.push('phone');
    if (role.length > 80) errors.push('role');
    if (message.length > 2000) errors.push('message');

    return {
        valid: errors.length === 0,
        errors,
        value: { name, schoolName, email, phone, role, message }
    };
};

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const resolvePlatformRecipients = async () => {
    const configured = String(
        process.env.PLATFORM_NOTIFY_EMAIL
        || process.env.SUPER_ADMIN_EMAIL
        || ''
    ).trim();
    if (configured) return configured;

    const admins = await User.find({ role: 'super_admin', isActive: true })
        .select('email')
        .setOptions({ skipTenantFilter: true })
        .lean();
    return admins.map((admin) => admin.email).filter(Boolean).join(', ');
};

export const notifyDemoRequest = async (demoRequest) => {
    let recipients = '';
    try {
        recipients = await resolvePlatformRecipients();
    } catch (error) {
        logger.warn('demo_request_recipient_lookup_failed', { message: error?.message });
    }
    if (!recipients) {
        logger.warn('demo_request_recipient_missing', { demoRequestId: demoRequest?._id?.toString?.() });
        return { sent: false, reason: 'no_recipient' };
    }

    const rows = [
        ['Contact', demoRequest.name],
        ['School', demoRequest.schoolName],
        ['Email', demoRequest.email],
        ['Phone', demoRequest.phone || '—'],
        ['Role', demoRequest.role || '—'],
        ['Message', demoRequest.message || '—'],
        ['Language', demoRequest.locale || 'en']
    ];
    const text = [
        'A new demo has been requested on the landing page.',
        '',
        ...rows.map(([label, value]) => `${label}: ${value}`),
        '',
        'Open the super admin dashboard to follow up.'
    ].join('\n');
    const html = `
        <div style="font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #0f172a; line-height: 1.6;">
            <h2 style="margin: 0 0 4px;">New demo request</h2>
            <p style="margin: 0 0 16px; color: #475569;">${escapeHtml(demoRequest.schoolName)} asked for a demo.</p>
            <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
                ${rows.map(([label, value]) => `
                    <tr>
                        <td style="padding: 6px 10px; border: 1px solid #e2e8f0; background: #f8fafc; font-weight: 600; width: 120px;">${escapeHtml(label)}</td>
                        <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">${escapeHtml(value)}</td>
                    </tr>`).join('')}
            </table>
            <p style="margin: 16px 0 0; color: #475569;">Open the super admin dashboard to follow up.</p>
        </div>
    `;

    try {
        await sendTransactionalEmail({
            to: recipients,
            subject: `Demo request — ${demoRequest.schoolName}`,
            text,
            html,
            allowAdminFallback: false,
            allowSmtp: true
        });
        return { sent: true };
    } catch (error) {
        logger.warn('demo_request_email_failed', {
            demoRequestId: demoRequest?._id?.toString?.(),
            message: error?.message
        });
        return { sent: false, reason: 'send_failed' };
    }
};
