import { sendTransactionalEmail } from './transactionalEmailService.js';

const eventSubjectByType = {
    trial_ending: 'Your trial ends in 3 days',
    trial_expired: 'Your trial has ended',
    subscription_expiring_7d_month: 'Your monthly subscription renews in 7 days',
    subscription_expiring_7d_year: 'Your annual subscription renews in 7 days',
    subscription_expiring_1d: 'Action required: subscription expires tomorrow',
    subscription_expired: 'Your subscription has ended',
    subscription_payment_failed: 'Payment failed - action required',
    subscription_renewed: 'Subscription renewed successfully',
    subscription_upgraded: 'Your plan has been upgraded'
};

const getSubject = ({ eventType, billingInterval, planName }) => {
    if (eventType === 'subscription_expiring' && billingInterval === 'year') {
        return eventSubjectByType.subscription_expiring_7d_year;
    }

    if (eventType === 'subscription_expiring') {
        return eventSubjectByType.subscription_expiring_7d_month;
    }

    if (eventType === 'subscription_upgraded' && planName) {
        return `Your plan has been upgraded to ${planName}`;
    }

    return eventSubjectByType[eventType] || 'Subscription update';
};

const safeDate = (value) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toISOString().split('T')[0];
};

const buildTextBody = ({ schoolName, planName, billingInterval, expiresAt, nextBillingDate, daysRemaining, portalBaseUrl }) => {
    const lines = [
        `School: ${schoolName}`,
        `Plan: ${planName}`,
        `Billing: ${billingInterval}`,
        `Days remaining: ${daysRemaining ?? 'N/A'}`,
        `Expiry / Next billing date: ${safeDate(expiresAt || nextBillingDate)}`,
        `Subscription page: ${portalBaseUrl}/portal/settings/subscription`,
        `Support: ${process.env.SUPPORT_EMAIL || 'support@gradebook.local'}`
    ];

    return lines.join('\n');
};

const buildHtmlBody = ({ schoolName, planName, billingInterval, expiresAt, nextBillingDate, daysRemaining, portalBaseUrl }) => {
    const pageUrl = `${portalBaseUrl}/portal/settings/subscription`;
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@gradebook.local';
    const dueDate = safeDate(expiresAt || nextBillingDate);

    return `
        <p>Hello,</p>
        <p>This is a subscription update for <strong>${schoolName}</strong>.</p>
        <ul>
            <li><strong>Plan:</strong> ${planName}</li>
            <li><strong>Billing interval:</strong> ${billingInterval}</li>
            <li><strong>Days remaining:</strong> ${daysRemaining ?? 'N/A'}</li>
            <li><strong>Expiry / Next billing date:</strong> ${dueDate}</li>
        </ul>
        <p>
            View subscription details:<br />
            <a href="${pageUrl}">${pageUrl}</a>
        </p>
        <p>
            Need help? Contact support at
            <a href="mailto:${supportEmail}">${supportEmail}</a>.
        </p>
    `;
};

export const sendSubscriptionEventEmail = async ({
    eventType,
    recipientEmail,
    schoolId,
    schoolName,
    planName,
    billingInterval = 'monthly',
    expiresAt = null,
    nextBillingDate = null,
    daysRemaining = null,
    preferredUserId = null
}) => {
    if (!recipientEmail) return null;

    const normalizedInterval = String(billingInterval || 'monthly').toLowerCase();
    const portalBaseUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    const subject = getSubject({
        eventType,
        billingInterval: normalizedInterval,
        planName
    });

    const payload = {
        schoolName,
        planName,
        billingInterval: normalizedInterval,
        expiresAt,
        nextBillingDate,
        daysRemaining,
        portalBaseUrl
    };

    return sendTransactionalEmail({
        to: recipientEmail,
        subject,
        text: buildTextBody(payload),
        html: buildHtmlBody(payload),
        schoolId,
        preferredUserId
    });
};

export default {
    sendSubscriptionEventEmail
};
