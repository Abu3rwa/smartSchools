import School from '../models/School.js';
import SupportRespondent from '../models/SupportRespondent.js';
import { renderTemplate } from '../emailTemplates/templateLoader.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';
import { rotateRespondentCode } from './supportAccessService.js';
import { claimDelivery, markDeliveryFailed, markDeliverySent } from './supportDeliveryService.js';

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
    subjectName = '',
    subjects = null,
    audience,
    dueDate,
    code,
    url,
}) => {
    const isParent = audience === 'parent';
    const subjectNames = (Array.isArray(subjects) && subjects.length ? subjects : [subjectName]).filter(Boolean);
    const headlineEn = isParent
        ? 'A short survey about your child'
        : `A short survey about ${studentName}`;
    const introEn = isParent
        ? 'Your answers help the homeroom teacher build this month\'s support plan. It takes about three minutes, and you can write anything else you want the teacher to know.'
        : 'Your answers help the homeroom teacher build this month\'s support plan. It takes about three minutes. Thank you for making the time.';

    const codeBlock = code
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f172a;border-radius:12px;margin-bottom:18px;">
             <tr><td style="padding:16px 18px;text-align:center;">
               <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;">Your six-digit code</p>
               <p style="margin:0;font-size:30px;letter-spacing:10px;font-weight:800;color:#ffffff;font-family:Menlo,Consolas,monospace;">${code}</p>
             </td></tr>
           </table>`
        : `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#334155;">Use the six-digit code from your earlier email. If you no longer have it, ask the homeroom teacher to issue a new one.</p>`;

    const urlBlock = url
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
             <tr><td style="border-radius:10px;background-color:#0f766e;">
               <a href="${url}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Open the survey</a>
             </td></tr>
           </table>`
        : '';

    const detailLine = isParent
        ? `${studentName} · ${schoolName}`
        : `${subjectNames.length ? subjectNames.join(', ') : 'Subject'} · ${studentName} · ${schoolName}`;
    const dueLine = dueDate
        ? `Please answer by ${dateLine(dueDate, 'en')}`
        : '';
    const footerEn = 'This link is personal to you. Please do not forward it.';

    const html = renderTemplate('supportAccess', {
        schoolName,
        academicYear,
        headlineEn,
        introEn,
        studentLabelEn: isParent ? 'Your child' : 'Student',
        studentName,
        detailLine,
        dueLine,
        footerEn,
        codeBlock,
        urlBlock,
    });

    const text = [
        headlineEn,
        introEn,
        detailLine,
        dueLine,
        code ? `Your six-digit code: ${code}` : 'Use the six-digit code from your earlier email.',
        url ? `Open the survey: ${url}` : '',
        footerEn,
    ].filter(Boolean).join('\n\n');

    return {
        subject: isParent || subjectNames.length !== 1
            ? `Support survey — ${studentName}`
            : `Support survey — ${[subjectNames[0], studentName].filter(Boolean).join(' · ')}`,
        html,
        text,
    };
};

/** A reminder never rotates the code: the first email still works. */
export const buildReminderMessage = ({
    schoolName,
    academicYear,
    studentName,
    subjectName,
    audience,
    dueDate,
    url,
}) => {
    const isParent = audience === 'parent';
    const headlineEn = isParent
        ? 'A reminder about the short survey'
        : 'A reminder about the support survey';
    const introEn = 'This is a friendly reminder. The survey is still open, and your answers help the school agree on the next small step. It takes about three minutes.';
    const codeBlock = `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#334155;">Use the six-digit code from your first email. If you no longer have it, ask the homeroom teacher for a new one.</p>`;
    const urlBlock = url
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
             <tr><td style="border-radius:10px;background-color:#0f766e;">
               <a href="${url}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Open the survey</a>
             </td></tr>
           </table>`
        : '';
    const detailLine = isParent
        ? `${studentName} · ${schoolName}`
        : `${subjectName || 'Subject'} · ${studentName} · ${schoolName}`;
    const dueLine = dueDate ? `Please answer by ${dateLine(dueDate, 'en')}` : '';

    const html = renderTemplate('supportAccess', {
        schoolName,
        academicYear,
        headlineEn,
        introEn,
        studentLabelEn: isParent ? 'Your child' : 'Student',
        studentName,
        detailLine,
        dueLine,
        footerEn: 'This link is personal to you. Please do not forward it.',
        codeBlock,
        urlBlock,
    });
    const text = [
        headlineEn,
        introEn,
        detailLine,
        dueLine,
        codeBlock.replace(/<[^>]+>/g, ''),
        url ? `Open the survey: ${url}` : '',
        'This link is personal to you. Please do not forward it.',
    ].filter(Boolean).join('\n\n');
    return {
        subject: isParent
            ? `Reminder: support survey — ${studentName}`
            : `Reminder: support survey — ${[subjectName, studentName].filter(Boolean).join(' · ')}`,
        html,
        text,
    };
};

/** Reminders never mutate the survey or rotate a code; the caller owns that state.
    `reminderNumber` is the claimed reminder ordinal — it keys the ledger so a
    provider timeout after delivery cannot produce a duplicate email. */
export const sendSurveyReminders = async ({
    schoolId,
    surveys = [],
    student,
    reminderNumber = null,
    env = process.env,
}) => {
    const school = await School.findById(schoolId).select('name').lean().setOptions({ skipTenantFilter: true });
    const base = clientBase(env);
    const results = [];
    for (const survey of surveys) {
        const recipient = recipientFor(survey);
        if (!recipient.email) {
            results.push({ surveyId: String(survey._id), status: 'skipped', reason: 'no-email' });
            continue;
        }

        let claim = null;
        if (reminderNumber != null) {
            claim = await claimDelivery({
                schoolId,
                kind: 'reminder',
                dedupeKey: `reminder:${survey._id}:${reminderNumber}`,
                recipientEmail: recipient.email,
                surveyId: survey._id,
                respondentId: survey.respondent?._id || null,
            });
            if (claim.skip) {
                results.push({ surveyId: String(survey._id), status: 'skipped', reason: 'already-sent' });
                continue;
            }
        }

        const message = buildReminderMessage({
            schoolName: school?.name || '',
            academicYear: survey.review?.academicYear || survey.cycle?.academicYear || student?.academicYear || '',
            studentName: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
            subjectName: survey.subject?.name || '',
            audience: survey.audience,
            dueDate: survey.dueDate,
            url: base ? `${base}/support-access` : '',
        });
        try {
            const outcome = await sendTransactionalEmail({
                to: recipient.email,
                subject: message.subject,
                text: message.text,
                html: message.html,
                schoolId,
            });
            results.push({ surveyId: String(survey._id), status: 'sent' });
            await markDeliverySent(claim?.record, outcome?.messageId);
        } catch (error) {
            results.push({ surveyId: String(survey._id), status: 'failed', reason: error?.message || 'send-failed' });
            await markDeliveryFailed(claim?.record, error);
        }
    }
    return results;
};

const CODE_FIELDS = ['codeHash', 'codeHint', 'codeLookup', 'codeIssuedAt', 'failedAttempts', 'lockedUntil', 'tokenVersion'];

/** Snapshot before rotating so a failed send can put the working code back. */
export const respondentCodeSnapshot = (respondent) => {
    const snapshot = {};
    for (const field of CODE_FIELDS) snapshot[field] = respondent[field];
    return snapshot;
};

export const restoreRespondentCode = (respondent, snapshot) => {
    for (const field of CODE_FIELDS) respondent[field] = snapshot[field];
};

export const invitationDedupeKey = (scope, respondentId) => (
    scope ? `invite:${scope}:${respondentId}` : `invite:manual:${respondentId}:${Date.now()}`
);

/** One group per respondent: the access page opens all of that person's
    surveys with one code, so a teacher with several subjects gets one email. */
export const groupSurveysForSend = (surveys) => {
    const groups = new Map();
    const skips = [];
    for (const survey of surveys) {
        if (survey.status === 'submitted') {
            skips.push({ survey, reason: 'submitted' });
            continue;
        }
        const respondentId = String(survey.respondent?._id || '');
        if (!respondentId) {
            skips.push({ survey, reason: 'no-respondent' });
            continue;
        }
        if (!groups.has(respondentId)) groups.set(respondentId, []);
        groups.get(respondentId).push(survey);
    }
    return { groups, skips };
};

export const earliestDueDate = (group) => group
    .map((survey) => survey.dueDate)
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b))[0] || null;

/**
 * Send invitations for surveys that are not submitted. The homeroom teacher's
 * own mailbox is the sender when possible; otherwise the school sender is used.
 * `dedupeScope` marks automated sends (`review:<id>`): one delivery per
 * respondent per scope. Manual re-invites pass null and always go out.
 */
export const sendSurveyInvitations = async ({
    schoolId,
    cycle,
    surveys,
    student,
    senderUserId = null,
    dedupeScope = null,
    env = process.env,
}) => {
    const school = await School.findById(schoolId).select('name').lean().setOptions({ skipTenantFilter: true });
    const results = [];
    const base = clientBase(env);
    const { groups, skips } = groupSurveysForSend(surveys);
    for (const { survey, reason } of skips) {
        results.push({ surveyId: String(survey._id), status: 'skipped', reason });
    }

    for (const [respondentId, group] of groups) {
        const survey = group[0];
        const recipient = recipientFor(survey);
        if (!recipient.email) {
            for (const row of group) results.push({ surveyId: String(row._id), status: 'skipped', reason: 'no-email' });
            continue;
        }

        const claim = await claimDelivery({
            schoolId,
            kind: 'invitation',
            dedupeKey: invitationDedupeKey(dedupeScope, respondentId),
            recipientEmail: recipient.email,
            respondentId,
        });
        if (claim.skip) {
            for (const row of group) results.push({ surveyId: String(row._id), status: 'skipped', reason: 'already-sent' });
            continue;
        }

        // Codes live only as a hash, so a fresh one is issued for the email.
        // Rotate on a full doc: the populated survey respondent can be a partial
        // select, and restoring onto it would unset the previous code's hash.
        const respondentDoc = await SupportRespondent.findById(respondentId).select('+codeHash');
        if (!respondentDoc) {
            await markDeliveryFailed(claim.record, 'respondent missing');
            for (const row of group) results.push({ surveyId: String(row._id), status: 'skipped', reason: 'no-respondent' });
            continue;
        }
        const snapshot = respondentCodeSnapshot(respondentDoc);

        try {
            const code = await rotateRespondentCode(respondentDoc);
            const message = buildInviteMessage({
                schoolName: school?.name || '',
                academicYear: cycle.academicYear,
                studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
                subjects: group.map((row) => row.subject?.name || ''),
                audience: survey.audience,
                dueDate: earliestDueDate(group),
                code,
                url: base ? `${base}/support-access?code=${encodeURIComponent(code)}` : '',
            });

            const outcome = await sendTransactionalEmail({
                to: recipient.email,
                subject: message.subject,
                text: message.text,
                html: message.html,
                schoolId,
                preferredUserId: senderUserId,
            });
            respondentDoc.codeDeliveredAt = new Date();
            await respondentDoc.save();
            for (const row of group) {
                row.sentAt = row.sentAt || new Date();
                await row.save();
                results.push({
                    surveyId: String(row._id),
                    status: 'sent',
                    email: recipient.email,
                    codeIncluded: Boolean(code),
                });
            }
            await markDeliverySent(claim.record, outcome?.messageId);
        } catch (error) {
            // A failed send must never invalidate the code that already works.
            restoreRespondentCode(respondentDoc, snapshot);
            await respondentDoc.save();
            for (const row of group) {
                results.push({
                    surveyId: String(row._id),
                    status: 'failed',
                    email: recipient.email,
                    reason: error?.message || 'send-failed',
                });
            }
            await markDeliveryFailed(claim.record, error);
        }
    }

    return results;
};

/**
 * Staff-only escalation email. One send per recipient per run; the caller
 * batches the unacknowledged or overdue cases into a single digest.
 */
export const sendStaffEscalation = async ({
    schoolId,
    recipientEmail,
    subject,
    introEn,
    cases = [],
    senderUserId = null,
    env = process.env,
}) => {
    if (!recipientEmail || cases.length === 0) return { status: 'skipped', reason: 'nothing-to-send' };
    const base = clientBase(env);
    const listHtml = cases.map((row) => (
        `<tr>
           <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;">${row.studentName}</td>
           <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;">${row.actionEn}</td>
           <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;">${row.ownerName || '—'}</td>
           <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#334155;">${row.dueEn || '—'}</td>
         </tr>`
    )).join('');
    const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">${introEn}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:10px;border-collapse:collapse;">
        <thead>
          <tr style="background-color:#f8fafc;">
            <th align="left" style="padding:10px 14px;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;color:#64748b;">Student</th>
            <th align="left" style="padding:10px 14px;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;color:#64748b;">Needed</th>
            <th align="left" style="padding:10px 14px;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;color:#64748b;">Owner</th>
            <th align="left" style="padding:10px 14px;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;color:#64748b;">Due</th>
          </tr>
        </thead>
        <tbody>${listHtml}</tbody>
      </table>
      ${base ? `<p style="margin:16px 0 0;"><a href="${base}/support" style="font-size:14px;font-weight:700;color:#0f766e;">Open the support hub</a></p>` : ''}
    </div>`;
    const text = [
        introEn,
        ...cases.map((row) => `- ${row.studentName}: ${row.actionEn}${row.ownerName ? ` (owner: ${row.ownerName})` : ''}${row.dueEn ? `, due ${row.dueEn}` : ''}`),
        base ? `Open the support hub: ${base}/support` : '',
    ].filter(Boolean).join('\n');

    const claim = await claimDelivery({
        schoolId,
        kind: 'escalation',
        dedupeKey: `escalation:${subject.scope}:${recipientEmail}`,
        recipientEmail,
    });
    if (claim.skip) return { status: 'skipped', reason: 'already-sent' };

    try {
        const outcome = await sendTransactionalEmail({
            to: recipientEmail,
            subject: subject.text,
            text,
            html,
            schoolId,
            preferredUserId: senderUserId,
        });
        await markDeliverySent(claim.record, outcome?.messageId);
        return { status: 'sent' };
    } catch (error) {
        await markDeliveryFailed(claim.record, error);
        return { status: 'failed', reason: error?.message || 'send-failed' };
    }
};
