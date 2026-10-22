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
    cc = null,
    subject,
    text,
    html,
    schoolId = null,
    preferredUserId = null,
    allowAdminFallback = true,
    allowSmtp = true
}) => {
    const recipientEmail = normalizeRecipientList(to);
    const ccEmail = normalizeRecipientList(cc);

    if (!recipientEmail) {
        throw new Error('Cannot send email without a recipient');
    }

    const mailOptions = {
        to: recipientEmail,
        subject,
        text,
        html
    };
    // Omitted rather than blanked, so a sender never receives an empty Cc header.
    if (ccEmail) mailOptions.cc = ccEmail;

    // An explicit sender is authoritative: never send their mail through an admin or SMTP account.
    if (preferredUserId) {
        const senderId = preferredUserId.toString();
        try {
            const result = await gmailOAuthService.sendEmail(senderId, mailOptions);
            return {
                channel: 'gmail_oauth',
                messageId: result.messageId,
                threadId: result.threadId
            };
        } catch (error) {
            if (!error.code) error.code = 'GMAIL_SEND_FAILED';
            throw error;
        }
    }

    // Gmail OAuth — admin fallback for system-generated email with no explicit sender.
    if (allowAdminFallback && schoolId) {
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

    // SMTP is retained for legacy transactional callers, but individual features
    // can disable it when delivery must use an approved OAuth sender.
    if (!allowSmtp) {
        const error = new Error(preferredUserId
            ? 'The connected Google account could not send this email. No alternate sender was used.'
            : 'A Google account must be connected before this email can be sent.');
        error.statusCode = 401;
        error.code = 'GMAIL_REAUTH_REQUIRED';
        throw error;
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
