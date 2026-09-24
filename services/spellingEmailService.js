import xss from 'xss';
import Student from '../models/Student.js';
import SpellingEmailDelivery from '../models/SpellingEmailDelivery.js';
import { sendTransactionalEmail } from './transactionalEmailService.js';
import logger from '../utils/logger.js';

const MAX_ATTEMPTS = 3;
const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const recipientList = (student) => [...new Set([
    student.studentEmail,
    student.parentInfo?.fatherEmail,
    student.parentInfo?.motherEmail,
    student.parentInfo?.guardianEmail
].map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))];

export async function queueSpellingCompletionEmail({ session, dbSession }) {
    const student = await Student.findOne({ _id: session.student, school: session.school }).session(dbSession).lean();
    if (!student) return null;
    const recipients = recipientList(student);
    if (recipients.length === 0) return null;

    const attempts = session.attempts || [];
    const rows = attempts.map((attempt) => `<tr><td>${escapeHtml(attempt.wordSnapshot)}</td><td>${attempt.correct ? 'Correct' : '<span style="color:#c0392b">Incorrect</span>'}</td></tr>`).join('');
    const subject = `Spelling assessment results - ${new Date(session.startedAt).toLocaleDateString()}`;
    const text = `Spelling assessment results\nCorrect: ${session.correctCount}\nIncorrect: ${session.mistakeCount}\nRetest deadline: ${new Date(session.retestDeadline).toLocaleDateString()}`;
    const html = xss(`<h2>Spelling assessment results</h2><p>Correct: ${session.correctCount} | Incorrect: ${session.mistakeCount}</p><p>Retest deadline: ${escapeHtml(new Date(session.retestDeadline).toLocaleDateString())}</p><table><tbody>${rows}</tbody></table>`, {
        whiteList: { h2: [], p: [], table: [], tbody: [], tr: [], td: [], span: ['style'] }
    });

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
        try {
            await sendTransactionalEmail({
                to: delivery.recipients,
                subject: delivery.subject,
                text: delivery.text,
                html: delivery.html,
                schoolId: delivery.school
            });
            await SpellingEmailDelivery.updateOne({ _id: delivery._id, status: 'processing' }, { $set: { status: 'sent', sentAt: new Date(), lastError: '' } });
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
            stats.failed += 1;
        }
    }
    return stats;
}
