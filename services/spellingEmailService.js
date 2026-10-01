import xss from 'xss';
import Student from '../models/Student.js';
import SpellingEmailDelivery from '../models/SpellingEmailDelivery.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingPassage from '../models/SpellingPassage.js';
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
    const targetWords = [...new Set(attempts.filter((attempt) => !attempt.correct).map((attempt) => String(attempt.wordSnapshot || '').trim()).filter(Boolean))];
    const targetWordList = targetWords.map((word) => `<span style="display:inline-block;background:#fff8e6;border:1px solid #f0dca0;color:#7a5b00;font-size:12px;font-weight:600;padding:5px 9px;border-radius:6px;margin:2px 4px 2px 0;">${escapeHtml(word)}</span>`).join('');
        const rows = attempts.map((attempt, index) => {
                const resultLabel = attempt.correct ? 'Correct' : 'Incorrect';
                const badge = attempt.correct
                        ? '<span style="background:#e8f8ee;color:#1e8e4f;font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;">Correct</span>'
                        : '<span style="background:#fdecea;color:#c0392b;font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;">Incorrect</span>';
                const rowBackground = index % 2 === 1 ? 'background:#fafbfc;' : '';
                return `<tr><td style="padding:9px 10px;border-bottom:1px solid #eef0f4;${rowBackground}color:#1a2436;">${escapeHtml(attempt.wordSnapshot)}</td><td style="padding:9px 10px;border-bottom:1px solid #eef0f4;${rowBackground}" align="right" aria-label="${resultLabel}">${badge}</td></tr>`;
        }).join('');
        const grades = [...new Set(attempts.map((attempt) => attempt.grade).filter(Boolean))].join(', ');
        const weeks = [...new Set(attempts.map((attempt) => attempt.week).filter(Boolean))].join(', ');
        const categories = [...new Set(attempts.map((attempt) => attempt.category).filter(Boolean))].join(', ');
        const completedDate = new Date(session.startedAt).toLocaleDateString();
        const retestDate = new Date(session.retestDeadline).toLocaleDateString();
        const subject = `Spelling level check summary - ${completedDate}`;
    const portalUrl = process.env.PORTAL_URL || process.env.CLIENT_URL || '';
        const text = `Spelling level check summary\nThis is not a graded assignment. It is a KG-Grade 5 spelling assessment used to understand the student's spelling level.\nGrade: ${grades || 'Not specified'}\nWeek: ${weeks || 'Not specified'}\nCategory: ${categories || 'Not specified'}\nTarget words to practice: ${targetWords.length ? targetWords.join(', ') : 'None'}\nCorrect: ${session.correctCount}\nIncorrect: ${session.mistakeCount}\nRetest deadline: ${retestDate}${portalUrl ? `\nOpen portal: ${portalUrl}` : ''}`;
        const html = xss(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;font-family:Segoe UI,Arial,sans-serif;">
    <tr><td style="background:#2c5aa0;padding:28px 32px;">
        <div style="color:#ffffff;font-size:20px;font-weight:600;">Spelling Level Check</div>
        <div style="color:#cfe0f5;font-size:13px;padding-top:4px;">Completed ${escapeHtml(completedDate)}</div>
    </td></tr>
    <tr><td style="padding:20px 32px 0;font-size:13px;color:#4a5568;">
        <div style="padding-bottom:8px;color:#1a2436;font-weight:600;">This is not a graded assignment.</div>
        <div style="padding-bottom:4px;">This is a KG-G5 spelling assessment helps show the student's current spelling level.</div>
        <div style="padding-bottom:4px;"><strong style="color:#1a2436;">Grade:</strong> ${escapeHtml(grades || 'Not specified')}</div>
        <div style="padding-bottom:4px;"><strong style="color:#1a2436;">Week:</strong> ${escapeHtml(weeks || 'Not specified')}</div>
        <div><strong style="color:#1a2436;">Category:</strong> ${escapeHtml(categories || 'Not specified')}</div>
    </td></tr>
    <tr><td style="padding:16px 32px 4px;">
        <div style="font-size:13px;font-weight:700;color:#1a2436;margin-bottom:8px;">Target words to practice</div>
        <div style="font-size:13px;line-height:1.8;">${targetWordList || '<span style="color:#6b7280;">No missed words</span>'}</div>
    </td></tr>
    <tr><td style="padding:20px 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td width="48%" style="background:#e8f8ee;border:1px solid #bfe8cc;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:#1e8e4f;">${session.correctCount}</div>
                <div style="font-size:12px;color:#2f6b45;margin-top:6px;text-transform:uppercase;">Correct</div>
            </td>
            <td width="4%"></td>
            <td width="48%" style="background:#fdecea;border:1px solid #f5c6c2;border-radius:8px;padding:16px;text-align:center;">
                <div style="font-size:26px;font-weight:700;color:#c0392b;">${session.mistakeCount}</div>
                <div style="font-size:12px;color:#a13b30;margin-top:6px;text-transform:uppercase;">Incorrect</div>
            </td>
        </tr></table>
    </td></tr>
    <tr><td style="padding:16px 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
            <tr>
                <td style="padding:8px 10px;background:#f3f5f8;color:#5a6472;font-weight:600;border-bottom:2px solid #e2e6ec;">Word</td>
                <td style="padding:8px 10px;background:#f3f5f8;color:#5a6472;font-weight:600;border-bottom:2px solid #e2e6ec;" align="right">Result</td>
            </tr>
            ${rows}
        </table>
    </td></tr>
    <tr><td style="padding:16px 32px 4px;">
        <div style="background:#fff8e6;border:1px solid #f0dca0;border-radius:8px;padding:12px 14px;font-size:13px;color:#7a5b00;">
            Retest deadline: <strong>${escapeHtml(retestDate)}</strong>
        </div>
    </td></tr>
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
        recipients,
        subject,
        html,
        text
    }], { session: dbSession }).then(([delivery]) => delivery);
}

export async function processDueSpellingEmails({ now = new Date(), limit = 25 } = {}) {
    const stats = { claimed: 0, sent: 0, failed: 0 };
    for (let index = 0; index < Math.min(Math.max(Number(limit) || 25, 1), 100); index += 1) {
        const delivery = await SpellingEmailDelivery.findOneAndUpdate(
            { status: { $in: ['pending', 'failed'] }, attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now } },
            { $set: { status: 'processing' }, $inc: { attempts: 1 } },
            { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
        );
        if (!delivery) break;
        stats.claimed += 1;
        await SpellingSession.updateOne(
            { _id: delivery.session, school: delivery.school },
            { $inc: { emailAttempts: 1 }, $set: { emailStatus: 'pending' } }
        );
        try {
            await sendTransactionalEmail({
                to: delivery.recipients,
                subject: delivery.subject,
                text: delivery.text,
                html: delivery.html,
                schoolId: delivery.school,
                allowSmtp: false
            });
            await SpellingEmailDelivery.updateOne({ _id: delivery._id, status: 'processing' }, { $set: { status: 'sent', sentAt: new Date(), lastError: '' } });
            await SpellingSession.updateOne({ _id: delivery.session, school: delivery.school }, { $set: { emailStatus: 'sent', emailSentAt: new Date(), emailError: null } });
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
            await SpellingSession.updateOne({ _id: delivery.session, school: delivery.school }, { $set: { emailStatus: exhausted ? 'failed' : 'pending', emailError: error.message } });
            if (delivery.kind === 'passage') {
                await SpellingPassage.updateOne({ school: delivery.school, session: delivery.session }, { $set: { status: exhausted ? 'failed' : 'queued', lastError: error.message } });
            }
            stats.failed += 1;
        }
    }
    return stats;
}
