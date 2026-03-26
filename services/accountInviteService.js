import crypto from 'crypto';
import Notification from '../models/Notification.js';
import School from '../models/School.js';
import User from '../models/User.js';
import { clearRefreshToken } from './authTokenService.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';
import { getPortalUrl } from '../helpers/portalUrl.js';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export const generateInvitePassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const consonants = 'bcdfghjkmnpqrstvwxyz';
    const vowels = 'aeiou';
    const digits = '23456789';
    const pick = (chars) => chars[crypto.randomInt(chars.length)];
    const chunk = () => `${pick(consonants)}${pick(vowels)}${pick(consonants)}${pick(vowels)}`;

    // Readable 12-char temporary password with no special symbols.
    // Keeps randomness while reducing typing friction for families/staff.
    return `${pick(upper)}${chunk()}${pick(digits)}${pick(digits)}${chunk()}${pick(digits)}`;
};

const resolveSchoolName = async (schoolId) => {
    if (!schoolId) return 'School';
    const school = await School.findById(schoolId).select('name').lean();
    return school?.name || 'School';
};

const getRoleDisplayName = (role) => {
    switch (role) {
        case 'teacher':
            return 'Teacher';
        case 'student':
            return 'Student';
        case 'parent':
            return 'Parent';
        default:
            return 'User';
    }
};

const buildInviteEmailContent = ({
    schoolName,
    recipientName,
    recipientEmail,
    tempPassword,
    role,
    linkedStudents = []
}) => {
    const frontendUrl = getPortalUrl();
    const displayName = recipientName || getRoleDisplayName(role);
    const roleLabel = getRoleDisplayName(role);
    const linkedChildrenLine = linkedStudents.length > 0
        ? `Linked student${linkedStudents.length > 1 ? 's' : ''}: ${linkedStudents.join(', ')}`
        : null;

    const subject = `${schoolName} ${roleLabel} Login Credentials`;
    const textParts = [
        `Hello ${displayName},`,
        '',
        `Your ${schoolName} ${roleLabel.toLowerCase()} login is ready.`,
        `Email: ${recipientEmail}`,
        `Temporary password: ${tempPassword}`,
        linkedChildrenLine,
        '',
        `Sign in: ${frontendUrl}`,
        '',
        'You will be required to change this password the first time you sign in.',
        'If you did not expect this email, contact your school administrator.'
    ].filter(Boolean);

    const htmlStudents = linkedStudents.length > 0
        ? `
            <p>
                <strong>Linked student${linkedStudents.length > 1 ? 's' : ''}:</strong>
                ${escapeHtml(linkedStudents.join(', '))}
            </p>
        `
        : '';

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px;">
            <h2 style="margin-bottom: 16px;">${escapeHtml(subject)}</h2>
            <p>Hello ${escapeHtml(displayName)},</p>
            <p>Your ${escapeHtml(schoolName)} ${escapeHtml(roleLabel.toLowerCase())} login is ready.</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:20px 0;">
                <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(recipientEmail)}</p>
                <p style="margin:0;"><strong>Temporary password:</strong> ${escapeHtml(tempPassword)}</p>
            </div>
            ${htmlStudents}
            <p>
                <a href="${frontendUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;">
                    Open Portal
                </a>
            </p>
            <p>You will be required to change this password the first time you sign in.</p>
            <p>If you did not expect this email, contact your school administrator.</p>
        </div>
    `.trim();

    return {
        subject,
        message: textParts.join('\n'),
        htmlContent
    };
};

export const updateUserInviteStatus = async ({
    userId,
    sentBy,
    recipientEmail,
    role,
    status,
    error = null,
    sentAt = new Date()
}) => {
    await User.findByIdAndUpdate(
        userId,
        {
            $set: {
                loginInvite: {
                    sentAt,
                    sentBy: sentBy || null,
                    deliveryStatus: status,
                    deliveryError: error || null,
                    recipientEmail,
                    role
                }
            }
        },
        { runValidators: true }
    ).setOptions({ skipTenantFilter: true });
};

export const upsertInvitedUser = async ({
    existingUserId = null,
    schoolId,
    email,
    firstName,
    lastName,
    role,
    tempPassword,
    allowRoleCorrection = false
}) => {
    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
        throw new Error('Valid email is required');
    }

    let user = null;
    let created = false;

    if (existingUserId) {
        user = await User.findById(existingUserId)
            .select('+password')
            .setOptions({ skipTenantFilter: true });
        if (!user) {
            throw new Error('Linked user account not found');
        }

        if (user.school?.toString() !== schoolId.toString()) {
            throw new Error('Linked user belongs to another school');
        }

        if (user.role !== role) {
            if (!allowRoleCorrection) {
                throw new Error(`Linked user role must be "${role}"`);
            }
            user.role = role;
        }

        if (user.email !== normalizedEmail) {
            const duplicate = await User.findOne({
                email: normalizedEmail,
                _id: { $ne: user._id }
            }).setOptions({ skipTenantFilter: true });

            if (duplicate) {
                throw new Error(`Email "${normalizedEmail}" is already in use`);
            }
            user.email = normalizedEmail;
        }
    } else {
        user = await User.findOne({ email: normalizedEmail })
            .select('+password')
            .setOptions({ skipTenantFilter: true });

        if (!user) {
            user = new User({
                email: normalizedEmail,
                password: tempPassword,
                role,
                school: schoolId,
                firstName,
                lastName,
                isActive: true,
                mustChangePassword: true
            });
            created = true;
        } else {
            if (user.school?.toString() !== schoolId.toString()) {
                throw new Error(`Email "${normalizedEmail}" is linked to another school account`);
            }
            if (user.role !== role) {
                throw new Error(`Email "${normalizedEmail}" is linked to a non-${role} account`);
            }
        }
    }

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.isActive = true;
    user.mustChangePassword = true;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.password = tempPassword;
    await user.save();
    await clearRefreshToken(user._id);

    return {
        user,
        created,
        email: normalizedEmail
    };
};

export const deliverLoginInvite = async ({
    schoolId,
    actorUserId,
    recipientUser,
    recipientEmail,
    recipientName,
    role,
    tempPassword,
    linkedStudents = [],
    studentId = null
}) => {
    const schoolName = await resolveSchoolName(schoolId);
    const emailContent = buildInviteEmailContent({
        schoolName,
        recipientName,
        recipientEmail,
        tempPassword,
        role,
        linkedStudents
    });

    const notification = await Notification.create({
        school: schoolId,
        recipient: recipientUser?._id || undefined,
        recipientEmail,
        student: studentId || undefined,
        type: 'custom',
        subject: emailContent.subject,
        message: emailContent.message,
        htmlContent: emailContent.htmlContent,
        channels: ['email'],
        metadata: {
            category: 'login_invite',
            inviteRole: role,
            linkedStudents
        },
        createdBy: actorUserId
    });

    try {
        const delivery = await sendTransactionalEmail({
            to: recipientEmail,
            subject: emailContent.subject,
            text: emailContent.message,
            html: emailContent.htmlContent,
            schoolId,
            preferredUserId: actorUserId
        });

        await notification.markAsSent('email');
        await updateUserInviteStatus({
            userId: recipientUser._id,
            sentBy: actorUserId,
            recipientEmail,
            role,
            status: 'sent',
            sentAt: new Date()
        });

        return {
            emailSent: true,
            notificationId: notification._id,
            channel: delivery.channel
        };
    } catch (error) {
        await notification.markAsFailed('email', error);
        await updateUserInviteStatus({
            userId: recipientUser._id,
            sentBy: actorUserId,
            recipientEmail,
            role,
            status: 'failed',
            error: error.message || 'Invite delivery failed',
            sentAt: new Date()
        });

        return {
            emailSent: false,
            notificationId: notification._id,
            error: error.message || 'Invite delivery failed'
        };
    }
};
