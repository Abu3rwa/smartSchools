import User from '../models/User.js';
import gmailOAuthService from './gmailOAuthService.js';

const normalizeRecipientList = (value) => {
    if (Array.isArray(value)) {
        return value.filter(Boolean).join(', ');
    }
    return String(value || '').trim();
};

const createSmtpTransport = async () => {
    const smtpHost = process.env.EMAIL_HOST;
    const smtpPort = Number(process.env.EMAIL_PORT || 587);
    const smtpUser = process.env.EMAIL_USER;
    const smtpPass = process.env.EMAIL_PASS;

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

    const smtpTransport = await createSmtpTransport();
    if (smtpTransport) {
        const smtpUser = process.env.EMAIL_USER;
        await smtpTransport.sendMail({
            ...mailOptions,
            from: process.env.EMAIL_FROM || `"GradeBook" <${smtpUser}>`
        });
        return { channel: 'smtp' };
    }

    if (preferredUserId) {
        const senderId = preferredUserId.toString();
        if (await gmailOAuthService.hasValidTokens(senderId)) {
            const result = await gmailOAuthService.sendEmail(senderId, mailOptions);
            return {
                channel: 'gmail_oauth',
                messageId: result.messageId,
                threadId: result.threadId
            };
        }
    }

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

    throw new Error('No configured email transport available');
};

export default sendTransactionalEmail;
