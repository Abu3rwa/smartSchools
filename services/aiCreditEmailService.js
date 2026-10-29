import School from '../models/School.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { renderTemplate } from '../emailTemplates/templateLoader.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fill = (template, values = {}) => String(template || '')
    .replace(/\{(\w+)\}/g, (_, key) => (values[key] ?? ''));

export const formatUsd = (cents) => `$${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;

const COPY = {
    en: {
        low: {
            subject: 'Your AI credit is running low',
            headline: 'Your AI credit is running low',
            intro: 'You have used most of your AI credit. AI features keep working until the balance reaches zero.',
            next: 'To keep using AI without a break, ask for more credit now. Your school admin reviews each request.'
        },
        empty: {
            subject: 'Your AI credit has run out',
            headline: 'Your AI credit has run out',
            intro: 'Your AI credit is used up, so AI features are paused for now.',
            next: 'Ask for more credit and AI starts working again as soon as your school admin approves it. Everything that does not use AI keeps working.'
        },
        greeting: 'Hi {name},',
        greetingNoName: 'Hello,',
        balanceLabel: 'Balance left',
        balanceMeta: 'You get this email once each time your balance drops below {threshold}.',
        button: 'Open my AI credit',
        footer: 'Sent by {schoolName} through GradeBook Pro.',
        footerNoSchool: 'Sent through GradeBook Pro.'
    },
    ar: {
        low: {
            subject: 'رصيد الذكاء الاصطناعي يوشك على النفاد',
            headline: 'رصيدك يوشك على النفاد',
            intro: 'لقد استخدمت معظم رصيد الذكاء الاصطناعي. تستمر ميزات الذكاء الاصطناعي بالعمل حتى يصل الرصيد إلى الصفر.',
            next: 'لتواصل استخدام الذكاء الاصطناعي دون انقطاع، اطلب رصيدًا إضافيًا الآن. يراجع مسؤول المدرسة كل طلب.'
        },
        empty: {
            subject: 'نفد رصيد الذكاء الاصطناعي',
            headline: 'نفد رصيدك',
            intro: 'نفد رصيد الذكاء الاصطناعي، لذلك توقفت ميزات الذكاء الاصطناعي مؤقتًا.',
            next: 'اطلب رصيدًا إضافيًا وستعود ميزات الذكاء الاصطناعي للعمل فور موافقة مسؤول المدرسة. كل ما لا يعتمد على الذكاء الاصطناعي يستمر بالعمل.'
        },
        greeting: 'مرحبًا {name}،',
        greetingNoName: 'مرحبًا،',
        balanceLabel: 'الرصيد المتبقي',
        balanceMeta: 'تصلك هذه الرسالة مرة واحدة كلما انخفض رصيدك عن {threshold}.',
        button: 'فتح رصيدي',
        footer: 'أُرسلت من {schoolName} عبر GradeBook Pro.',
        footerNoSchool: 'أُرسلت عبر GradeBook Pro.'
    }
};

const buttonHtml = ({ url, label }) => {
    if (!url) return '';
    return [
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 4px;">',
        '<tr><td style="background-color:#0f766e;border-radius:10px;">',
        `<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>`,
        '</td></tr>',
        '</table>'
    ].join('');
};

/** Pure: builds the low/empty message. */
export const buildCreditAlertEmail = ({
    level,
    language = 'en',
    firstName = '',
    schoolName = '',
    balanceCents = 0,
    lowBalanceCents = 0,
    url = ''
}) => {
    const lang = language === 'ar' ? 'ar' : 'en';
    const copy = COPY[lang];
    const tier = copy[level === 'empty' ? 'empty' : 'low'];
    const name = String(firstName || '').trim();
    const school = String(schoolName || '').trim();
    const greeting = name ? fill(copy.greeting, { name }) : copy.greetingNoName;
    const balance = formatUsd(balanceCents);
    const balanceMeta = fill(copy.balanceMeta, { threshold: formatUsd(lowBalanceCents) });
    const footer = school ? fill(copy.footer, { schoolName: school }) : copy.footerNoSchool;

    const html = renderTemplate(lang === 'ar' ? 'aiCreditAlert_ar' : 'aiCreditAlert', {
        headerColor: level === 'empty' ? '#b45309' : '#0f766e',
        balanceColor: level === 'empty' ? '#b45309' : '#0f172a',
        schoolLabel: school || 'GradeBook Pro',
        headline: tier.headline,
        greeting,
        intro: tier.intro,
        balanceLabel: copy.balanceLabel,
        balance,
        balanceMeta,
        nextStep: tier.next,
        buttonHtml: buttonHtml({ url, label: copy.button }),
        footer
    });

    const text = [
        greeting,
        '',
        tier.intro,
        '',
        `${copy.balanceLabel}: ${balance}`,
        balanceMeta,
        '',
        tier.next,
        url ? `\n${url}` : '',
        '',
        footer
    ].filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');

    return { subject: tier.subject, html, text };
};

/** Fire-and-forget from the charge path: never throws. */
export const notifyCreditAlert = async ({
    schoolId,
    userId,
    level,
    balanceCents,
    lowBalanceCents,
    env = process.env
}) => {
    try {
        const [user, school] = await Promise.all([
            User.findOne({ _id: userId, school: schoolId }).select('firstName email').lean(),
            School.findOne({ _id: schoolId }).select('name reportSettings.defaultLanguage').lean()
        ]);
        const email = String(user?.email || '').trim();
        if (!email) return { skipped: 'no-address' };

        const language = String(school?.reportSettings?.defaultLanguage || '').toLowerCase() === 'arabic' ? 'ar' : 'en';
        const base = String(env.CLIENT_URL || env.FRONTEND_URL || '').replace(/\/+$/, '');
        const message = buildCreditAlertEmail({
            level,
            language,
            firstName: user.firstName,
            schoolName: school?.name,
            balanceCents,
            lowBalanceCents,
            url: base ? `${base}/portal/ai-credit/me` : ''
        });

        await sendTransactionalEmail({
            to: email,
            subject: message.subject,
            text: message.text,
            html: message.html,
            schoolId
        });
        return { sent: true };
    } catch (error) {
        logger.warn('ai_credit_alert_email_failed', {
            schoolId: String(schoolId),
            userId: String(userId),
            level,
            error: error?.message
        });
        return { sent: false };
    }
};
