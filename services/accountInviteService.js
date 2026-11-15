import crypto from 'crypto';
import Notification from '../models/Notification.js';
import School from '../models/School.js';
import User from '../models/User.js';
import { clearRefreshToken } from './authTokenService.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';
import { getPortalUrl, getClientUrl } from '../helpers/portalUrl.js';
import { getPlatformBranding } from './platformBrandingService.js';
import {
    renderSchoolEmailShell,
    EMAIL_COLORS,
    emailDetailRows,
    schoolAccent,
    escapeHtml
} from '../helpers/schoolEmailShell.js';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const createAccountInviteConflictError = (message, code) => {
    const error = new Error(message);
    error.statusCode = 409;
    error.code = code;
    return error;
};

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

const resolveSchool = async (schoolId) => {
    if (!schoolId) return null;
    return School.findById(schoolId)
        .select('name branding contact.adminEmail')
        .lean();
};

const resolveSenderEmail = async (actorUserId) => {
    if (!actorUserId) return '';
    const actor = await User.findById(actorUserId)
        .select('email')
        .setOptions({ skipTenantFilter: true })
        .lean();
    return String(actor?.email || '').trim();
};

const resolvePlatformIdentity = async () => {
    let name = 'ClassHope';
    try {
        name = (await getPlatformBranding()).appName || name;
    } catch {
        // Branding is cosmetic and must never block an invite.
    }
    return {
        name,
        url: getPortalUrl(),
        logoUrl: `${getClientUrl()}/apple-touch-icon.png`
    };
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

// Inline styles and tables only: mail clients drop flex, grid and media queries.
const emailButton = ({ href, label, accent }) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">`
    + `<tr><td bgcolor="${accent}" style="background-color:${accent};border-radius:9px;">`
    + `<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;">${escapeHtml(label)}</a>`
    + `</td></tr></table>`;

const emailParagraph = (html, { size = 15, color = EMAIL_COLORS.body, margin = '0 0 18px' } = {}) =>
    `<p style="margin:${margin};font-size:${size}px;line-height:1.7;color:${color};">${html}</p>`;

// The recipient replies to the person who sent the invite, not to a generic
// "administrator" nobody can reach. The school contact is only a fallback.
const contactAddressFor = ({ senderEmail, school }) =>
    String(senderEmail || school?.contact?.adminEmail || '').trim();

const contactParagraph = (address) => (address
    ? emailParagraph(`If you did not expect this email, contact ${escapeHtml(address)}.`, { size: 13, color: EMAIL_COLORS.muted, margin: '0' })
    : '');

const buildTeacherGoogleInviteContent = ({
    schoolName,
    school = null,
    senderEmail = '',
    platform = null,
    displayName,
    recipientEmail
}) => {
    // A teacher signs in with Google so their mail leaves from their own
    // mailbox. Sending a password they are not meant to use only causes
    // support calls, so this email carries the Google door instead.
    const signInUrl = `${getPortalUrl()}/login?role=teacher`;
    const subject = `${schoolName} teacher sign-in`;
    const contactAddress = contactAddressFor({ senderEmail, school });

    return {
        subject,
        message: [
            `Hello ${displayName},`,
            '',
            `Your ${schoolName} teacher account is ready.`,
            `Email: ${recipientEmail}`,
            '',
            'Sign in with Google using this email address. There is no password to remember:',
            signInUrl,
            '',
            'Choose the Google account that matches this email address.',
            contactAddress ? `If you did not expect this email, contact ${contactAddress}.` : null
        ].filter((line) => line !== null).join('\n'),
        htmlContent: renderSchoolEmailShell({
            school,
            subject,
            eyebrow: 'Teacher sign-in',
            bodyHtml: [
                emailParagraph(`Hello ${escapeHtml(displayName)},`),
                emailParagraph(`Your ${escapeHtml(schoolName)} teacher account is ready.`),
                emailParagraph('Sign in with Google using this email address. There is no password to remember.'),
                emailDetailRows([{ label: 'Email', value: recipientEmail }], { stack: true }),
                emailButton({ href: signInUrl, label: 'Sign in with Google', accent: schoolAccent(school) }),
                emailParagraph('Choose the Google account that matches this email address.', { size: 13, color: EMAIL_COLORS.muted, margin: '0 0 12px' }),
                contactParagraph(contactAddress)
            ].filter(Boolean).join('\n'),
            footer: [schoolName],
            platform
        })
    };
};

export const buildInviteEmailContent = ({
    schoolName = '',
    school = null,
    senderEmail = '',
    platform = null,
    recipientName,
    recipientEmail,
    tempPassword,
    role,
    linkedStudents = []
}) => {
    const frontendUrl = getPortalUrl();
    const displayName = recipientName || getRoleDisplayName(role);
    const roleLabel = getRoleDisplayName(role);
    const resolvedSchoolName = String(schoolName || school?.name || 'School').trim() || 'School';

    if (role === 'teacher') {
        return buildTeacherGoogleInviteContent({
            schoolName: resolvedSchoolName,
            school,
            senderEmail,
            platform,
            displayName,
            recipientEmail
        });
    }

    const linkedChildrenLine = linkedStudents.length > 0
        ? `Linked student${linkedStudents.length > 1 ? 's' : ''}: ${linkedStudents.join(', ')}`
        : null;
    const contactAddress = contactAddressFor({ senderEmail, school });

    const subject = `${resolvedSchoolName} ${roleLabel} Login Credentials`;
    const textParts = [
        `Hello ${displayName},`,
        '',
        `Your ${resolvedSchoolName} ${roleLabel.toLowerCase()} login is ready. Use these details the first time you sign in.`,
        `Email: ${recipientEmail}`,
        `Temporary password: ${tempPassword}`,
        linkedChildrenLine,
        '',
        `Sign in: ${frontendUrl}`,
        '',
        'Type the password exactly as shown. You will be asked to change it after you sign in.',
        contactAddress ? `If you did not expect this email, contact ${contactAddress}.` : null
    ].filter((line) => line !== null);

    const bodyHtml = [
        emailParagraph(`Hello ${escapeHtml(displayName)},`),
        emailParagraph(`Your ${escapeHtml(resolvedSchoolName)} ${escapeHtml(roleLabel.toLowerCase())} login is ready. Use these details the first time you sign in.`),
        emailDetailRows([
            { label: 'Email', value: recipientEmail },
            { label: 'Temporary password', value: tempPassword, mono: true },
            { label: `Linked student${linkedStudents.length > 1 ? 's' : ''}`, value: linkedStudents.join(', ') }
        ], { stack: true }),
        emailButton({ href: frontendUrl, label: 'Open Portal', accent: schoolAccent(school) }),
        emailParagraph('Type the password exactly as shown. You will be asked to change it after you sign in.', { size: 13, color: EMAIL_COLORS.muted, margin: '0 0 12px' }),
        contactParagraph(contactAddress)
    ].filter(Boolean).join('\n');

    return {
        subject,
        message: textParts.join('\n'),
        htmlContent: renderSchoolEmailShell({
            school,
            subject,
            eyebrow: `${roleLabel} login`,
            bodyHtml,
            footer: [resolvedSchoolName],
            platform
        })
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

    // Teachers never receive a usable password: they sign in with Google.
    // The account still needs an unguessable one internally.
    const googleOnlyTeacher = role === 'teacher';
    const accountPassword = googleOnlyTeacher
        ? crypto.randomBytes(32).toString('hex')
        : tempPassword;

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
                throw createAccountInviteConflictError(
                    `Email "${normalizedEmail}" is already in use`,
                    'ACCOUNT_EMAIL_IN_USE',
                );
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
                password: accountPassword,
                role,
                school: schoolId,
                firstName,
                lastName,
                isActive: true,
                mustChangePassword: !googleOnlyTeacher
            });
            created = true;
        } else {
            if (user.school?.toString() !== schoolId.toString()) {
                throw createAccountInviteConflictError(
                    `Email "${normalizedEmail}" is linked to another school account. A super admin must permanently remove that account before this email can be reused.`,
                    'ACCOUNT_EMAIL_LINKED_TO_ANOTHER_SCHOOL',
                );
            }
            if (user.role !== role) {
                throw createAccountInviteConflictError(
                    `Email "${normalizedEmail}" is linked to a non-${role} account`,
                    'ACCOUNT_ROLE_CONFLICT',
                );
            }
        }
    }

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.isActive = true;
    user.mustChangePassword = !googleOnlyTeacher;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    if (!googleOnlyTeacher) user.password = tempPassword;
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
    const [school, senderEmail, platform] = await Promise.all([
        resolveSchool(schoolId),
        resolveSenderEmail(actorUserId),
        resolvePlatformIdentity()
    ]);
    const schoolName = school?.name || 'School';
    const emailContent = buildInviteEmailContent({
        schoolName,
        school,
        senderEmail,
        platform,
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
