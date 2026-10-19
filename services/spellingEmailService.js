import xss from 'xss';
import Student from '../models/Student.js';
import SpellingEmailDelivery from '../models/SpellingEmailDelivery.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingPassage from '../models/SpellingPassage.js';
import { getPortalUrl } from '../helpers/portalUrl.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';
import logger from '../utils/logger.js';
import { DEFAULT_SPELLING_EMAIL_AUDIENCE, isSpellingEmailAudience } from '../utils/spellingEmailSettings.js';

const MAX_ATTEMPTS = 3;
const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const getSpellingAssessmentCoverage = (attempts = [], { fallbackGrade = '', fallbackWeek = null } = {}) => {
    const unique = (values) => [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
    const grades = unique(attempts.map((attempt) => attempt.grade));
    const weeks = [...new Set(attempts
        .map((attempt) => Number(attempt.week))
        .filter((week) => Number.isInteger(week) && week > 0))].sort((first, second) => first - second);
    const categories = unique(attempts.map((attempt) => attempt.category))
        .sort((first, second) => first.localeCompare(second, undefined, { sensitivity: 'base' }));

    if (grades.length === 0 && fallbackGrade) grades.push(String(fallbackGrade).trim());
    if (weeks.length === 0 && Number.isInteger(Number(fallbackWeek)) && Number(fallbackWeek) > 0) {
        weeks.push(Number(fallbackWeek));
    }

    return { grades, weeks, categories };
};

export const resolveSpellingCompletionRecipients = (student, audience) => {
    if (!student || audience === 'none') return [];
    const entries = typeof student.getAllContactEmailEntries === 'function'
        ? student.getAllContactEmailEntries()
        : [
            ...(student.parentInfo ? [
                { email: student.parentInfo.fatherEmail, type: 'father' },
                { email: student.parentInfo.motherEmail, type: 'mother' },
                { email: student.parentInfo.guardianEmail, type: 'guardian' }
            ] : []),
            { email: student.studentEmail, type: 'student' },
            { email: student.email, type: 'student' },
            { email: student.user?.email, type: 'student' }
        ];
    return [...new Set(entries
        .filter((entry) => audience === 'student-and-parents'
            || (audience === 'student-only' && entry.type === 'student')
            || (audience === 'parents-only' && ['father', 'mother', 'guardian'].includes(entry.type)))
        .map((entry) => String(entry.email || '').trim().toLowerCase())
        .filter(Boolean))];
};

export const buildFormalTestWordList = ({ retestItems }) => {
    const uniqueMissedWords = new Map();
    for (const item of retestItems) {
        const key = String(item.sourceWord);
        if (!key) continue;
        const existing = uniqueMissedWords.get(key);
        if (existing && (existing.status !== 'practice-mastered' || item.status === 'practice-mastered')) continue;
        uniqueMissedWords.set(key, {
            wordId: item.sourceWord,
            wordSnapshot: item.wordSnapshot,
            grade: item.grade,
            week: item.week,
            category: item.category,
            order: null,
            retestItemId: item._id,
            isRetest: true,
            status: item.status
        });
    }
    const plannedWords = [...uniqueMissedWords.values()].map((item) => ({
        wordId: item.wordId,
        wordSnapshot: item.wordSnapshot,
        grade: item.grade,
        week: item.week,
        category: item.category,
        order: item.order,
        retestItemId: item.retestItemId,
        isRetest: item.isRetest
    }));
    return {
        lowConfidenceWords: plannedWords.map((item) => item.wordSnapshot),
        curriculumWords: [],
        plannedWords
    };
};

export async function queueSpellingCompletionEmail({ session, dbSession }) {
    const audience = isSpellingEmailAudience(session.emailNotification)
        ? session.emailNotification
        : DEFAULT_SPELLING_EMAIL_AUDIENCE;
    if (audience === 'none') {
        await SpellingSession.updateOne(
            { _id: session._id, school: session.school },
            { $set: { emailStatus: 'not-applicable', emailError: 'Spelling completion email sending is disabled' } },
            { session: dbSession }
        );
        return null;
    }

    const student = await Student.findOne({ _id: session.student, school: session.school })
        .populate('user', 'email')
        .session(dbSession);
    if (!student) return null;
    const recipients = resolveSpellingCompletionRecipients(student, audience);
    if (recipients.length === 0) {
        await SpellingSession.updateOne(
            { _id: session._id, school: session.school },
            { $set: { emailStatus: 'not-applicable', emailError: 'No student or parent email addresses are configured' } },
            { session: dbSession }
        );
        return null;
    }

    const attempts = session.attempts || [];
    const isFormalAssessment = session.assessmentType === 'formal-spelling-test';
    const coverage = getSpellingAssessmentCoverage(attempts, {
        fallbackGrade: session.curriculumGrade,
        fallbackWeek: session.curriculumWeek
    });
    const targetWords = [...new Set(attempts.filter((attempt) => !attempt.correct).map((attempt) => String(attempt.wordSnapshot || '').trim()).filter(Boolean))];
    const targetWordList = targetWords.map((word) => `<span style="display:inline-block;background:#fff8e6;border:1px solid #f0dca0;color:#7a5b00;font-size:12px;font-weight:600;padding:5px 9px;border-radius:6px;margin:2px 4px 2px 0;">${escapeHtml(word)}</span>`).join('');
        const rows = attempts.map((attempt, index) => {
                const resultLabel = attempt.correct ? 'Correct' : 'Incorrect';
                const badge = attempt.correct
                        ? '<span style="background:#e8f8ee;color:#1e8e4f;font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;">Correct</span>'
                        : '<span style="background:#fdecea;color:#c0392b;font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;">Incorrect</span>';
                const rowBackground = index % 2 === 1 ? 'background:#fafbfc;' : '';
                const coverageCells = isFormalAssessment
                    ? `<td style="padding:9px 10px;border-bottom:1px solid #eef0f4;${rowBackground}color:#4a5568;">${escapeHtml(attempt.week)}</td><td style="padding:9px 10px;border-bottom:1px solid #eef0f4;${rowBackground}color:#4a5568;">${escapeHtml(attempt.category)}</td>`
                    : '';
                return `<tr><td style="padding:9px 10px;border-bottom:1px solid #eef0f4;${rowBackground}color:#1a2436;">${escapeHtml(attempt.wordSnapshot)}</td>${coverageCells}<td style="padding:9px 10px;border-bottom:1px solid #eef0f4;${rowBackground}" align="right" aria-label="${resultLabel}">${badge}</td></tr>`;
        }).join('');
        const gradeLabel = coverage.grades.length === 1 ? 'Grade' : 'Grades';
        const weekLabel = coverage.weeks.length === 1 ? 'Week' : 'Weeks';
        const categoryLabel = coverage.categories.length === 1 ? 'Category' : 'Categories';
        const coverageText = [
            coverage.grades.length ? `${gradeLabel}: ${coverage.grades.join(', ')}` : '',
            coverage.weeks.length ? `${weekLabel}: ${coverage.weeks.join(', ')}` : '',
            coverage.categories.length ? `${categoryLabel}: ${coverage.categories.join(', ')}` : ''
        ].filter(Boolean).join('\n');
        const coverageHtml = [
            coverage.grades.length ? `<div style="padding-bottom:4px;"><strong style="color:#1a2436;">${gradeLabel}:</strong> ${escapeHtml(coverage.grades.join(', '))}</div>` : '',
            coverage.weeks.length ? `<div style="padding-bottom:4px;"><strong style="color:#1a2436;">${weekLabel}:</strong> ${escapeHtml(coverage.weeks.join(', '))}</div>` : '',
            coverage.categories.length ? `<div><strong style="color:#1a2436;">${categoryLabel}:</strong> ${escapeHtml(coverage.categories.join(', '))}</div>` : ''
        ].join('');
        const completedDate = new Date(session.completedAt || session.startedAt).toLocaleDateString();
        const retestDate = new Date(session.retestDeadline).toLocaleDateString();
        const score = Math.min(session.correctCount, attempts.length);
        const subject = isFormalAssessment
            ? `Formal spelling quiz result - ${completedDate}`
            : `Spelling level check summary - ${completedDate}`;
    const portalUrl = getPortalUrl();
        const text = isFormalAssessment
        ? `Formal spelling quiz result\nThis was a graded spelling quiz and its score has been recorded in the Gradebook.${coverageText ? `\n${coverageText}` : ''}\nScore: ${score} out of ${attempts.length} words\nWords to practice: ${targetWords.length ? targetWords.join(', ') : 'None'}${portalUrl ? `\nOpen portal: ${portalUrl}` : ''}`
        : `Spelling level check summary\nThis is not a graded assignment. It is a KG-Grade 5 spelling assessment used to understand the student's spelling level.\nGrade: ${coverage.grades.join(', ') || 'Not specified'}\nWeek: ${coverage.weeks.join(', ') || 'Not specified'}\nCategory: ${coverage.categories.join(', ') || 'Not specified'}\nTarget words to practice: ${targetWords.length ? targetWords.join(', ') : 'None'}\nCorrect: ${session.correctCount}\nIncorrect: ${session.mistakeCount}\nRetest deadline: ${retestDate}${portalUrl ? `\nOpen portal: ${portalUrl}` : ''}`;
        const html = xss(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;font-family:Segoe UI,Arial,sans-serif;">
    <tr><td style="background:#2c5aa0;padding:28px 32px;">
        <div style="color:#ffffff;font-size:20px;font-weight:600;">${isFormalAssessment ? 'Formal Spelling Quiz Result' : 'Spelling Level Check'}</div>
        <div style="color:#cfe0f5;font-size:13px;padding-top:4px;">Completed ${escapeHtml(completedDate)}</div>
    </td></tr>
    <tr><td style="padding:20px 32px 0;font-size:13px;color:#4a5568;">
        <div style="padding-bottom:8px;color:#1a2436;font-weight:600;">${isFormalAssessment ? 'This is a graded quiz. The result has been recorded in the Gradebook.' : 'This is not a graded assignment.'}</div>
        <div style="padding-bottom:4px;">${isFormalAssessment ? 'Formal spelling assessment result.' : 'This is a KG-G5 spelling assessment used to understand the student’s current spelling level.'}</div>
        ${isFormalAssessment
            ? `<div style="padding:10px 12px;margin-top:8px;border-radius:6px;background:#f3f5f8;"><strong style="display:block;padding-bottom:5px;color:#1a2436;">Quiz coverage</strong>${coverageHtml}</div>`
            : `${coverage.grades.length ? `<div style="padding-bottom:4px;"><strong style="color:#1a2436;">Grade:</strong> ${escapeHtml(coverage.grades.join(', '))}</div>` : ''}${coverage.weeks.length ? `<div style="padding-bottom:4px;"><strong style="color:#1a2436;">Week:</strong> ${escapeHtml(coverage.weeks.join(', '))}</div>` : ''}${coverage.categories.length ? `<div><strong style="color:#1a2436;">Category:</strong> ${escapeHtml(coverage.categories.join(', '))}</div>` : ''}`}
    </td></tr>
    <tr><td style="padding:16px 32px 4px;">
        <div style="font-size:13px;font-weight:700;color:#1a2436;margin-bottom:8px;">${isFormalAssessment ? 'Words to practice' : 'Target words to practice'}</div>
        <div style="font-size:13px;line-height:1.8;">${targetWordList || '<span style="color:#6b7280;">No missed words</span>'}</div>
    </td></tr>
    <tr><td style="padding:20px 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${isFormalAssessment
                ? `<td width="100%" style="background:#e8f8ee;border:1px solid #bfe8cc;border-radius:8px;padding:16px;text-align:center;">
                    <div style="font-size:26px;font-weight:700;color:#1e8e4f;">${score} / ${attempts.length}</div>
                    <div style="font-size:12px;color:#2f6b45;margin-top:6px;text-transform:uppercase;">Graded quiz score</div>
                </td>`
                : `<td width="48%" style="background:#e8f8ee;border:1px solid #bfe8cc;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:#1e8e4f;">${session.correctCount}</div>
                <div style="font-size:12px;color:#2f6b45;margin-top:6px;text-transform:uppercase;">Correct</div>
            </td>
            <td width="4%"></td>
            <td width="48%" style="background:#fdecea;border:1px solid #f5c6c2;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:#c0392b;">${session.mistakeCount}</div>
                <div style="font-size:12px;color:#a13b30;margin-top:6px;text-transform:uppercase;">Incorrect</div>
            </td>`}
        </tr></table>
    </td></tr>
    <tr><td style="padding:16px 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
            <tr>
                <td style="padding:8px 10px;background:#f3f5f8;color:#5a6472;font-weight:600;border-bottom:2px solid #e2e6ec;">Word</td>
        ${isFormalAssessment ? '<td style="padding:8px 10px;background:#f3f5f8;color:#5a6472;font-weight:600;border-bottom:2px solid #e2e6ec;">Week</td><td style="padding:8px 10px;background:#f3f5f8;color:#5a6472;font-weight:600;border-bottom:2px solid #e2e6ec;">Category</td>' : ''}
        <td style="padding:8px 10px;background:#f3f5f8;color:#5a6472;font-weight:600;border-bottom:2px solid #e2e6ec;" align="right">Result</td>
            </tr>
            ${rows}
        </table>
    </td></tr>
    ${isFormalAssessment ? '' : `<tr><td style="padding:16px 32px 4px;">
        <div style="background:#fff8e6;border:1px solid #f0dca0;border-radius:8px;padding:12px 14px;font-size:13px;color:#7a5b00;">
            Retest deadline: <strong>${escapeHtml(retestDate)}</strong>
        </div>
    </td></tr>`}
    ${portalUrl ? `<tr><td style="padding:20px 32px 28px;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#2c5aa0;border-radius:6px;">
            <a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:11px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Open Spelling Portal</a>
        </td></tr></table>
    </td></tr>` : ''}
    
</table>
</td></tr></table>`, {
                whiteList: {
                        table: ['role', 'width', 'cellpadding', 'cellspacing', 'style', 'align'],
                        tr: [],
                        td: ['style', 'width', 'align', 'aria-label'],
                        div: ['style'],
                        span: ['style'],
                        a: ['href', 'style'],
                        strong: ['style']
                }
    });

    await SpellingSession.updateOne(
        { _id: session._id, school: session.school },
        { $set: { emailStatus: 'pending', emailError: null } },
        { session: dbSession }
    );
    return SpellingEmailDelivery.create([{
        school: session.school,
        session: session._id,
        student: session.student,
        senderUser: session.createdBy || session.administeredBy || null,
        recipients,
        subject,
        html,
        text
    }], { session: dbSession }).then(([delivery]) => delivery);
}

export async function queueSpellingRetestPracticeEmail({ session, words, dbSession }) {
    const audience = isSpellingEmailAudience(session.emailNotification)
        ? session.emailNotification
        : DEFAULT_SPELLING_EMAIL_AUDIENCE;
    if (audience === 'none') {
        await SpellingSession.updateOne(
            { _id: session._id, school: session.school },
            { $set: { retestEmailStatus: 'not-applicable' } },
            { session: dbSession }
        );
        return null;
    }

    const student = await Student.findOne({ _id: session.student, school: session.school })
        .populate('user', 'email')
        .session(dbSession);
    if (!student) throw new Error('Student not found while preparing spelling retest email');
    const recipients = resolveSpellingCompletionRecipients(student, audience);
    if (recipients.length === 0) {
        await SpellingSession.updateOne(
            { _id: session._id, school: session.school },
            { $set: { retestEmailStatus: 'not-applicable' } },
            { session: dbSession }
        );
        return null;
    }

    const wordList = words.map((word) => `<li style="padding:4px 0;">${escapeHtml(word)}</li>`).join('');
    const portalUrl = getPortalUrl();
    const quizDate = new Date(session.startedAt).toLocaleDateString();
    const subject = 'Your spelling graded quiz is ready to practice';
    const text = `Your spelling retest quiz is now available. Practice these words before you begin:\n${words.map((word) => `- ${word}`).join('\n')}\n${portalUrl ? `Open the spelling portal: ${portalUrl}` : ''}`;
    const html = xss(`
        <div style="font-family:Segoe UI,Arial,sans-serif;color:#1a2436;max-width:600px;margin:0 auto;padding:24px;">
            <h2 style="color:#2c5aa0;">Spelling quiz practice</h2>
            <p>Your graded spelling quiz is available now. Practice these words before you begin:</p>
            <ul>${wordList}</ul>
            <p style="color:#5a6472;">Quiz available since ${escapeHtml(quizDate)}.</p>
            ${portalUrl ? `<p><a href="${escapeHtml(portalUrl)}">Open the spelling portal</a></p>` : ''}
        </div>
    `);

    await SpellingSession.updateOne(
        { _id: session._id, school: session.school },
        { $set: { retestEmailStatus: 'pending' } },
        { session: dbSession }
    );
    return SpellingEmailDelivery.create([{
        school: session.school,
        session: session._id,
        student: session.student,
        senderUser: session.createdBy || session.administeredBy || null,
        kind: 'retest-practice',
        recipients,
        subject,
        html,
        text
    }], { session: dbSession }).then(([delivery]) => delivery);
}

export const buildFormalSpellingTestWordListEmail = ({ session, lowConfidenceWords, timeZone = 'UTC' }) => {
    const scheduledDate = new Date(session.scheduledAt).toLocaleString(undefined, { timeZone });
    const wordBadges = (words, background, border, color) => words
        .map((word) => `<span style="display:inline-block;background:${background};border:1px solid ${border};color:${color};font-size:13px;font-weight:600;padding:6px 10px;border-radius:16px;margin:3px 4px 3px 0;">${escapeHtml(word)}</span>&nbsp;`)
        .join('');
    const lowConfidenceList = wordBadges(lowConfidenceWords, '#fff8e6', '#f0dca0', '#7a5b00');
    const totalWords = lowConfidenceWords.length;
    const portalUrl = getPortalUrl();
    const subject = `Words to prepare for your spelling test on ${scheduledDate}`;
    const text = [
        'Prepare for your spelling test',
        `Scheduled: ${scheduledDate}`,
        `The test list has ${totalWords} ${totalWords === 1 ? 'word' : 'words'}.`,
        '',
        'Unresolved missed words to review:',
        ...(lowConfidenceWords.length ? lowConfidenceWords.map((word) => `- ${word}`) : ['- None']),
        '',
        '',
        'Your test will use only this unresolved-word list and finish when you complete it, unless it ends earlier because the mistake limit is reached.',
        portalUrl ? `Open the spelling portal: ${portalUrl}` : ''
    ].filter((line) => line !== '').join('\n');
    const html = xss(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Segoe UI,Arial,sans-serif;color:#1a2436;">
  <tr><td style="background:#4338ca;padding:28px 32px;">
    <div style="color:#ffffff;font-size:22px;font-weight:700;">Prepare for your spelling test</div>
    <div style="color:#e0e0fb;font-size:14px;padding-top:7px;">A quick review today can help you feel ready.</div>
  </td></tr>
  <tr><td style="padding:24px 32px 12px;font-size:15px;line-height:1.6;color:#4a5568;">
    Your formal spelling test is scheduled for <strong style="color:#1a2436;">${escapeHtml(scheduledDate)}</strong>.
  </td></tr>
  <tr><td style="padding:4px 32px 18px;">
    <div style="background:#f3f5f8;border:1px solid #e2e6ec;border-radius:8px;padding:12px 16px;font-size:14px;color:#4a5568;">
      <strong style="color:#1a2436;">${totalWords} ${totalWords === 1 ? 'word' : 'words'} in your test</strong>
      <span> · This is the word list you will be tested on.</span>
    </div>
  </td></tr>
  <tr><td style="padding:4px 32px 16px;">
    <div style="font-size:15px;font-weight:700;color:#1a2436;margin-bottom:4px;">Words still to recover</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:8px;">Give these words extra practice.</div>
    <div style="font-size:13px;line-height:1.9;">${lowConfidenceList || '<span style="color:#6b7280;">No previously missed words.</span>'}</div>
  </td></tr>
  <tr><td style="padding:0 32px 20px;">
    <div style="background:#fff8e6;border:1px solid #f0dca0;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.5;color:#7a5b00;">
      Your formal test covers only these unresolved words and ends when you finish the list, unless the mistake limit is reached first.
    </div>
  </td></tr>
  ${portalUrl ? `<tr><td style="padding:4px 32px 24px;" align="center"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#4338ca;border-radius:6px;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;padding:12px 26px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Open Spelling Portal</a></td></tr></table></td></tr>` : ''}
  <tr><td style="padding:16px 32px 20px;border-top:1px solid #eef0f4;font-size:11px;color:#9aa4b2;">You’ve got this. Take your time and do your best.</td></tr>
</table>
</td></tr></table>`, {
        whiteList: {
            table: ['role', 'width', 'cellpadding', 'cellspacing', 'style', 'align'],
            tr: [],
            td: ['style', 'align'],
            div: ['style'],
            span: ['style'],
            strong: ['style'],
            a: ['href', 'style']
        }
    });
    return { subject, text, html };
};

export async function queueFormalSpellingTestWordListEmail({ session, lowConfidenceWords, audience, timeZone, dbSession }) {
    const student = await Student.findOne({ _id: session.student, school: session.school })
        .populate('user', 'email')
        .session(dbSession);
    if (!student) throw new Error('Student not found while preparing formal spelling test email');
    const recipients = resolveSpellingCompletionRecipients(student, audience);
    if (recipients.length === 0) {
        throw Object.assign(new Error('No email address is configured for the selected formal test email audience'), { statusCode: 400 });
    }

    const email = buildFormalSpellingTestWordListEmail({ session, lowConfidenceWords, timeZone });
    const [delivery] = await SpellingEmailDelivery.create([{
        school: session.school,
        session: session._id,
        student: session.student,
        senderUser: session.createdBy || null,
        kind: 'formal-test-prep',
        recipients,
        ...email
    }], { session: dbSession });
    return delivery;
}

export async function processDueSpellingEmails({ now = new Date(), limit = 25, deliveryId = null } = {}) {
    const stats = { claimed: 0, sent: 0, failed: 0 };
    for (let index = 0; index < Math.min(Math.max(Number(limit) || 25, 1), 100); index += 1) {
        const delivery = await SpellingEmailDelivery.findOneAndUpdate(
            {
                ...(deliveryId ? { _id: deliveryId } : {}),
                status: { $in: ['pending', 'failed'] },
                attempts: { $lt: MAX_ATTEMPTS },
                nextAttemptAt: { $lte: now }
            },
            { $set: { status: 'processing' }, $inc: { attempts: 1 } },
            { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
        );
        if (!delivery) break;
        stats.claimed += 1;
        if (delivery.kind !== 'formal-test-prep') {
            await SpellingSession.updateOne(
                { _id: delivery.session, school: delivery.school },
                delivery.kind === 'retest-practice'
                    ? { $inc: { emailAttempts: 1 }, $set: { retestEmailStatus: 'pending' } }
                    : { $inc: { emailAttempts: 1 }, $set: { emailStatus: 'pending' } }
            );
        }
        try {
            await sendTransactionalEmail({
                to: delivery.recipients,
                subject: delivery.subject,
                text: delivery.text,
                html: delivery.html,
                schoolId: delivery.school,
                preferredUserId: delivery.senderUser || null,
                allowAdminFallback: false,
                allowSmtp: false
            });
            await SpellingEmailDelivery.updateOne({ _id: delivery._id, status: 'processing' }, { $set: { status: 'sent', sentAt: new Date(), lastError: '' } });
            if (delivery.kind === 'retest-practice') {
                await SpellingSession.updateOne(
                    { _id: delivery.session, school: delivery.school },
                    { $set: { retestEmailStatus: 'sent' } }
                );
            } else if (delivery.kind !== 'formal-test-prep') {
                await SpellingSession.updateOne({ _id: delivery.session, school: delivery.school }, { $set: { emailStatus: 'sent', emailSentAt: new Date(), emailError: null } });
            }
            if (delivery.kind === 'passage') {
                await SpellingPassage.updateOne(
                    delivery.passage
                        ? { _id: delivery.passage, school: delivery.school }
                        : { school: delivery.school, session: delivery.session },
                    { $set: { status: 'sent', sentAt: new Date(), lastError: '' } }
                );
            }
            stats.sent += 1;
        } catch (error) {
            const exhausted = delivery.attempts >= MAX_ATTEMPTS;
            logger.error('spelling_completion_email_failed', {
                deliveryId: String(delivery._id),
                sessionId: String(delivery.session),
                attempts: delivery.attempts,
                exhausted,
                message: error.message
            });
            await SpellingEmailDelivery.updateOne(
                { _id: delivery._id, status: 'processing' },
                { $set: { status: exhausted ? 'failed' : 'pending', lastError: error.message, nextAttemptAt: new Date(Date.now() + (delivery.attempts * 5 * 60 * 1000)) } }
            );
            if (delivery.kind === 'retest-practice') {
                await SpellingSession.updateOne(
                    { _id: delivery.session, school: delivery.school },
                    { $set: { retestEmailStatus: exhausted ? 'failed' : 'pending' } }
                );
            } else if (delivery.kind !== 'formal-test-prep') {
                await SpellingSession.updateOne({ _id: delivery.session, school: delivery.school }, { $set: { emailStatus: exhausted ? 'failed' : 'pending', emailError: error.message } });
            }
            if (delivery.kind === 'passage') {
                await SpellingPassage.updateOne({ school: delivery.school, session: delivery.session }, { $set: { status: exhausted ? 'failed' : 'queued', lastError: error.message } });
            }
            stats.failed += 1;
        }
    }
    return stats;
}

export async function processSpellingEmailDelivery({ deliveryId }) {
    if (!deliveryId) throw new Error('A spelling email delivery ID is required');
    await processDueSpellingEmails({ limit: 1, deliveryId });
    return SpellingEmailDelivery.findById(deliveryId).select('status lastError').lean();
}
