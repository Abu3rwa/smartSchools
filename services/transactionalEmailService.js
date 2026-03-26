import User from '../models/User.js';
import gmailOAuthService from './gmailOAuthService.js';
import { getPlatformBranding } from './platformBrandingService.js';

const normalizeRecipientList = (value) => {
    if (Array.isArray(value)) {
        return value.filter(Boolean).join(', ');
    }
    return String(value || '').trim();
};

const createSmtpTransport = async () => {
    const smtpHost = process.env.SMTP_HOST || process.env.EMAIL_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
    const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
        return null;
    }

    const nodemailer = await import('nodemailer');
    return nodemailer.default.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
            user: smtpUser,
            pass: smtpPass
        }
    });
};

export const sendTransactionalEmail = async ({
    to,
    subject,
    text,
    html,
    schoolId = null,
    preferredUserId = null
}) => {
    const recipientEmail = normalizeRecipientList(to);

    if (!recipientEmail) {
        throw new Error('Cannot send email without a recipient');
    }

    const mailOptions = {
        to: recipientEmail,
        subject,
        text,
        html
    };

    // 1. Gmail OAuth — primary transport (preferred user)
    if (preferredUserId) {
        const senderId = preferredUserId.toString();
        try {
            if (await gmailOAuthService.hasValidTokens(senderId)) {
                const result = await gmailOAuthService.sendEmail(senderId, mailOptions);
                return {
                    channel: 'gmail_oauth',
                    messageId: result.messageId,
                    threadId: result.threadId
                };
            }
        } catch {
            // Fall through to admin Gmail
        }
    }

    // 2. Gmail OAuth — admin fallback
    if (schoolId) {
        const adminsWithGmail = await User.find({
            school: schoolId,
            role: 'admin',
            isActive: true,
            'gmailTokens.refreshToken': { $exists: true, $ne: null }
        })
            .select('_id')
            .setOptions({ skipTenantFilter: true })
            .lean();

        for (const admin of adminsWithGmail) {
            const adminId = admin._id.toString();
            try {
                if (await gmailOAuthService.hasValidTokens(adminId)) {
                    const result = await gmailOAuthService.sendEmail(adminId, mailOptions);
                    return {
                        channel: 'admin_gmail_fallback',
                        messageId: result.messageId,
                        threadId: result.threadId
                    };
                }
            } catch {
                // Try next admin sender.
            }
        }
    }

    // 3. SMTP — last-resort fallback
    const smtpTransport = await createSmtpTransport();
    if (smtpTransport) {
        const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
        const branding = await getPlatformBranding();
        await smtpTransport.sendMail({
            ...mailOptions,
            from: process.env.EMAIL_FROM || `"${branding.appName}" <${smtpUser}>`
        });
        return { channel: 'smtp_fallback' };
    }

    throw new Error('No configured email transport available');
};

export default sendTransactionalEmail;
