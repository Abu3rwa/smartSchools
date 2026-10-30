import School from '../models/School.js';
import { renderTemplate } from '../emailTemplates/templateLoader.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';
import { rotateRespondentCode } from './supportAccessService.js';

const MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
};

const dateLine = (date, language) => {
    if (!date) return '';
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    return language === 'ar'
        ? `${value.getDate()} ${MONTHS.ar[value.getMonth()]} ${value.getFullYear()}`
        : `${value.getDate()} ${MONTHS.en[value.getMonth()]} ${value.getFullYear()}`;
};

const clientBase = (env = process.env) => String(env.CLIENT_URL || env.FRONTEND_URL || '').replace(/\/+$/, '');

const recipientFor = (survey) => {
    const respondent = survey.respondent || {};
    if (respondent.kind === 'internal_teacher') {
        return {
            email: String(respondent.teacher?.email || '').trim().toLowerCase(),
            name: `${respondent.teacher?.firstName || ''} ${respondent.teacher?.lastName || ''}`.trim(),
        };
    }
    return {
        email: String(respondent.email || '').trim().toLowerCase(),
        name: respondent.name || '',
    };
};

export const buildInviteMessage = ({
    schoolName,
    academicYear,
    studentName,
    subjectName,
    audience,
    dueDate,
    code,
    previouslyDelivered,
    url,
}) => {
    const isParent = audience === 'parent';
    const headlineEn = isParent
        ? 'A short survey about your child'
        : `A short survey about ${studentName}`;
    const headlineAr = isParent
        ? 'استبيان قصير عن طفلكم'
        : `استبيان قصير عن ${studentName}`;
    const introEn = isParent
        ? 'Your answers help the homeroom teacher build this month\'s support plan. It takes about three minutes, and you can write anything else you want the teacher to know.'
        : 'Your answers help the homeroom teacher build this month\'s support plan. It takes about three minutes. Thank you for making the time.';
    const introAr = isParent
        ? 'إجاباتكم تساعد معلم الصف على بناء خطة الدعم لهذا الشهر. يستغرق الاستبيان نحو ثلاث دقائق، ويمكنكم كتابة أي ملاحظة إضافية تودون أن يعرفها المعلم.'
        : 'إجاباتكم تساعد معلم الصف على بناء خطة الدعم لهذا الشهر. يستغرق الاستبيان نحو ثلاث دقائق. شكرًا لوقتكم.';

    const codeBlock = code
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f172a;border-radius:12px;margin-bottom:18px;">
             <tr><td style="padding:16px 18px;text-align:center;">
               <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;">Your six-digit code · رمزكم المكون من ستة أرقام</p>
               <p style="margin:0;font-size:30px;letter-spacing:10px;font-weight:800;color:#ffffff;font-family:Menlo,Consolas,monospace;">${code}</p>
             </td></tr>
           </table>`
        : `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#334155;">Use the six-digit code from your earlier email. If you no longer have it, ask the homeroom teacher to issue a new one.</p>
           <p style="margin:0 0 18px;font-size:14px;line-height:1.8;color:#334155;direction:rtl;text-align:right;">استخدموا الرمز المكون من ستة أرقام من الرسالة السابقة. إذا لم يعد لديكم الرمز، اطلبوا من معلم الصف إصدار رمز جديد.</p>`;

    const urlBlock = url
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
             <tr><td style="border-radius:10px;background-color:#0f766e;">
               <a href="${url}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Open the survey · افتح الاستبيان</a>
             </td></tr>
           </table>`
        : '';

    const detailLine = isParent
        ? `${studentName} · ${schoolName}`
        : `${subjectName || 'Subject'} · ${studentName} · ${schoolName}`;
    const dueLine = dueDate
        ? `Please answer by ${dateLine(dueDate, 'en')} · يرجى الإجابة قبل ${dateLine(dueDate, 'ar')}`
        : '';

    const html = renderTemplate('supportAccess', {
        schoolName,
        academicYear,
        headlineEn,
        headlineAr,
        introEn,
        introAr,
        studentLabelEn: isParent ? 'Your child' : 'Student',
        studentName,
        detailLine,
        dueLine,
        footerEn: previouslyDelivered
            ? 'This link is personal to you. Please do not forward it.'
            : 'Keep this code private. It is yours and can be reused for future surveys.',
        footerAr: previouslyDelivered
            ? 'هذا الرابط خاص بكم. يرجى عدم إعادة توجيهه.'
            : 'احتفظوا بهذا الرمز. إنه خاص بكم ويمكن استخدامه للاستبيانات القادمة.',
        codeBlock,
        urlBlock,
    });

    const text = [
        headlineEn,
        introEn,
        detailLine,
        dueLine,
        code ? `Code: ${code}` : 'Use the code from your earlier email.',
        url ? `Open: ${url}` : '',
        headlineAr,
        introAr,
    ].filter(Boolean).join('\n\n');

    return {
        subject: isParent
            ? `Support survey · استبيان الدعم — ${studentName}`
            : `Support survey · استبيان الدعم — ${subjectName || ''} ${studentName}`.trim(),
        html,
        text,
    };
};

/**
 * Send invitations for surveys that are not submitted. The homeroom teacher's
 * own mailbox is the sender when possible; otherwise the school sender is used.
 */
export const sendSurveyInvitations = async ({
    schoolId,
    cycle,
    surveys,
    student,
    senderUserId = null,
    env = process.env,
}) => {
    const school = await School.findById(schoolId).select('name').lean().setOptions({ skipTenantFilter: true });
    const results = [];
    const base = clientBase(env);

    for (const survey of surveys) {
        if (survey.status === 'submitted') continue;
        const recipient = recipientFor(survey);
        if (!recipient.email) {
            results.push({ surveyId: String(survey._id), status: 'skipped', reason: 'no-email' });
            continue;
        }

        const respondent = survey.respondent;
        let code = null;
        if (!respondent.codeDeliveredAt) {
            code = await rotateRespondentCode(respondent);
            respondent.codeDeliveredAt = new Date();
        }

        const message = buildInviteMessage({
            schoolName: school?.name || '',
            academicYear: cycle.academicYear,
            studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            subjectName: survey.subject?.name || '',
            audience: survey.audience,
            dueDate: survey.dueDate,
            code,
            previouslyDelivered: !code && Boolean(respondent.codeDeliveredAt),
            url: code && base ? `${base}/support-access?code=${encodeURIComponent(code)}` : (base ? `${base}/support-access` : ''),
        });

        try {
            await sendTransactionalEmail({
                to: recipient.email,
                subject: message.subject,
                text: message.text,
                html: message.html,
                schoolId,
                preferredUserId: senderUserId,
            });
            if (respondent.isModified()) await respondent.save();
            survey.sentAt = survey.sentAt || new Date();
            await survey.save();
            results.push({ surveyId: String(survey._id), status: 'sent', email: recipient.email, codeIncluded: Boolean(code) });
        } catch (error) {
            await respondent.save();
            results.push({
                surveyId: String(survey._id),
                status: 'failed',
                email: recipient.email,
                reason: error?.message || 'send-failed',
            });
        }
    }

    return results;
};
