/**
 * The one narrow exception to "never auto-send": newsletter-submission
 * deadlines, only after the teacher's separate opt-in and risk confirmation.
 * Every deadline is claimed atomically before any work, so a tick overlap or a
 * failure can never produce a second reply.
 */
import InboxDeadline from '../../models/InboxDeadline.js';
import InboxEmail from '../../models/InboxEmail.js';
import InboxReplyDraft from '../../models/InboxReplyDraft.js';
import Notification from '../../models/Notification.js';
import gmailOAuthService from '../gmailOAuthService.js';
import { sendPushToUsers } from '../pushNotificationService.js';
import { NOTIFICATION_TYPES } from '../../constants/notificationTypes.js';
import { buildPortalLink } from '../../helpers/portalUrl.js';
import { getTeacherProfile } from '../../helpers/teacherScoping.js';
import {
    getDatePartsInTimeZone,
    resolveTimeZone,
    ymdKey,
    zonedDateTimeToUtc
} from '../../utils/schoolTimezone.js';
import logger from '../../utils/logger.js';
import { buildSendMailOptions } from './inboxSendService.js';
import { saveToGmailDraft } from './inboxDraftService.js';
import { buildSubjectSummaries } from './inboxNewsletterSummaryService.js';
import { effectiveDeliveryMode, normalizeNewsletterAutoReply } from './inboxNewsletterSettings.js';

const HOUR_MS = 60 * 60 * 1000;
const OPEN_STATES = ['proposed', 'confirmed'];

/** Date-only deadlines are due at the end of their day in the teacher's zone. */
export const deadlineWindow = (deadline, now) => {
    const due = new Date(deadline.dueAt);
    if (Number.isNaN(due.getTime())) return null;
    const tz = resolveTimeZone(deadline.timeZone);
    const dueParts = getDatePartsInTimeZone(due, tz);
    const isDueToday = ymdKey(dueParts) === ymdKey(getDatePartsInTimeZone(now, tz));
    const effectiveDue = deadline.dueDateOnly
        ? zonedDateTimeToUtc({ ...dueParts, hour: 23, minute: 59, second: 59 }, tz)
        : due;
    return { isDueToday, hoursUntilDue: (effectiveDue.getTime() - now.getTime()) / HOUR_MS };
};

export const senderFirstNameOf = (email) => {
    const named = String(email?.fromName || '').trim().split(/\s+/)[0];
    if (named) return named;
    const local = String(email?.fromEmail || '').split('@')[0].split(/[._-]+/)[0];
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
    return 'there';
};

const summaryLines = (summaries) => summaries
    .map(({ subjectName, summary }) => `${subjectName}: ${summary}`)
    .join('\n');

export const composeNewsletterReplyBody = ({ senderFirstName, teacherFirstName, summaries, language = 'en' }) => {
    const lines = summaryLines(summaries);
    if (language === 'ar') {
        return [
            `مرحبًا ${senderFirstName}،`,
            `أنا مساعد ${teacherFirstName}. لم يطّلع ${teacherFirstName} على رسالتك بعد، لكن بناءً على خطط دروسه، إليك ملخصات المواد التي يمكنك استخدامها في أقسام النشرة الإخبارية إلى أن تتاح له فرصة مراجعة رسالتك بنفسه:`,
            lines,
            `كما سأرسل بريدًا إلى ${teacherFirstName} مباشرة بصفتي مساعده لتذكيره برسالتك.`,
            `— مساعد ${teacherFirstName}`
        ].join('\n\n');
    }
    return [
        `Hello ${senderFirstName},`,
        `This is ${teacherFirstName}'s Assistant. ${teacherFirstName} hasn't seen this email yet, but based on his lesson plans, here are the subject summaries you can use in your newsletter sections until he has a chance to review your message himself:`,
        lines,
        `I'm also emailing ${teacherFirstName} directly as his assistant to remind him about your message.`,
        `— ${teacherFirstName}'s Assistant`
    ].join('\n\n');
};

const replySubject = (original) => {
    const subject = String(original || '').trim();
    if (!subject) return 'Newsletter summaries';
    return /^(re|رد)\s*:/i.test(subject) ? subject : `Re: ${subject}`;
};

const NOTICE_COPY = {
    sent: {
        en: (ctx) => ({
            subject: 'Newsletter reply sent automatically',
            message: `Your assistant replied to ${ctx.sender} ("${ctx.subject}") with your lesson summaries.\n\n${ctx.preview}`
        }),
        ar: (ctx) => ({
            subject: 'أُرسل ردّ النشرة الإخبارية تلقائيًا',
            message: `ردّ مساعدك على ${ctx.sender} («${ctx.subject}») بملخصات دروسك.\n\n${ctx.preview}`
        })
    },
    drafted: {
        en: (ctx) => ({
            subject: 'Newsletter reply saved to Gmail Drafts',
            message: `A reply to ${ctx.sender} ("${ctx.subject}") with your lesson summaries is waiting in your Gmail Drafts. Review it and send it yourself.`
        }),
        ar: (ctx) => ({
            subject: 'حُفظ ردّ النشرة الإخبارية في مسودات Gmail',
            message: `ردّ على ${ctx.sender} («${ctx.subject}») بملخصات دروسك بانتظارك في مسودات Gmail. راجعه وأرسله بنفسك.`
        })
    },
    noPlans: {
        en: (ctx) => ({
            subject: 'Newsletter deadline needs you',
            message: `A newsletter deadline for ${ctx.sender} is coming up, but there are no recent lesson plans to summarize. Reply yourself.`
        }),
        ar: (ctx) => ({
            subject: 'موعد النشرة الإخبارية بحاجة إليك',
            message: `اقترب موعد تسليم النشرة الإخبارية لـ ${ctx.sender}، لكن لا توجد خطط دروس حديثة لتلخيصها. ردّ بنفسك.`
        })
    },
    existingDraft: {
        en: (ctx) => ({
            subject: 'Newsletter reply already drafted',
            message: `You already have a reply draft for ${ctx.sender} ("${ctx.subject}"). The assistant left it alone — review and send it yourself.`
        }),
        ar: (ctx) => ({
            subject: 'ردّ النشرة الإخبارية مكتوب مسبقًا',
            message: `لديك بالفعل مسودة ردّ على ${ctx.sender} («${ctx.subject}»). لم يلمسها المساعد — راجعها وأرسلها بنفسك.`
        })
    },
    failed: {
        en: (ctx) => ({
            subject: 'Automatic newsletter reply failed',
            message: `The assistant could not reply to ${ctx.sender} ("${ctx.subject}") automatically. It will not try again — reply yourself.`
        }),
        ar: (ctx) => ({
            subject: 'فشل الردّ التلقائي على النشرة الإخبارية',
            message: `لم يتمكن المساعد من الردّ على ${ctx.sender} («${ctx.subject}») تلقائيًا. لن يعيد المحاولة — ردّ بنفسك.`
        })
    },
    reauth: {
        en: () => ({
            subject: 'Reconnect Google for newsletter replies',
            message: 'Your Google access expired, so the assistant could not handle a newsletter deadline. Connect Google again in Inbox Assistant, then reply yourself.'
        }),
        ar: () => ({
            subject: 'أعد ربط Google لردود النشرة الإخبارية',
            message: 'انتهت صلاحية وصولك إلى Google، لذلك لم يتمكن المساعد من معالجة موعد النشرة الإخبارية. أعد ربط Google في مساعد البريد الوارد، ثم ردّ بنفسك.'
        })
    }
};

const notifyTeacher = async ({ user, kind, ctx, language, deadlineId, pushSender }) => {
    if (!user.email) return;
    const copy = (NOTICE_COPY[kind][language] || NOTICE_COPY[kind].en)(ctx);
    const link = buildPortalLink('/inbox');
    try {
        await Notification.create({
            school: user.school,
            recipient: user._id,
            recipientEmail: user.email,
            type: NOTIFICATION_TYPES.INBOX_NEWSLETTER_AUTOREPLY_SENT,
            subject: copy.subject,
            message: copy.message,
            channels: ['push'],
            priority: 'normal',
            metadata: { deadlineId: String(deadlineId), link }
        });
        await pushSender({
            schoolId: user.school,
            userIds: [user._id],
            title: copy.subject,
            body: copy.message,
            data: { type: 'inbox_newsletter_autoreply', link },
            collapseKey: 'inbox_newsletter_autoreply'
        });
    } catch (error) {
        logger.warn('inbox_newsletter_autoreply_notice_failed', {
            user: String(user._id),
            deadline: String(deadlineId),
            error: error?.message
        });
    }
};

export const runNewsletterAutoReplyForUser = async (user, settings, { now = new Date(), pushSender = sendPushToUsers } = {}) => {
    const result = { sent: 0, drafted: 0, skipped: 0, failed: 0 };
    const cfg = normalizeNewsletterAutoReply(settings?.newsletterAutoReply);
    if (!cfg.enabled || !cfg.confirmedRisk) return result;

    const deadlines = await InboxDeadline.find({
        school: user.school,
        user: user._id,
        category: 'newsletter',
        state: { $in: OPEN_STATES },
        autoReplySentAt: null
    }).sort({ dueAt: 1 }).populate('email').lean();

    const eligible = deadlines.filter((deadline) => {
        if (!deadline.email?.fromEmail) return false;
        const window = deadlineWindow(deadline, now);
        return window
            && window.isDueToday
            && window.hoursUntilDue >= 0
            && window.hoursUntilDue <= cfg.hoursBeforeDeadline;
    });
    if (!eligible.length) return result;

    const teacher = await getTeacherProfile(user._id);
    const teacherFirstName = user.firstName
        || String(user.fullName || '').trim().split(/\s+/)[0]
        || 'Teacher';
    const deliveryMode = effectiveDeliveryMode(cfg.deliveryMode);

    // Sequential per deadline: two items in one thread must not race Gmail.
    for (const deadline of eligible) {
        const claimed = await InboxDeadline.findOneAndUpdate(
            {
                _id: deadline._id,
                school: user.school,
                user: user._id,
                state: { $in: OPEN_STATES },
                autoReplySentAt: null
            },
            { $set: { autoReplySentAt: now } },
            { new: true }
        ).lean();
        if (!claimed) continue;

        const email = deadline.email;
        const language = email.language === 'ar' ? 'ar' : 'en';
        const ctx = { sender: email.fromName || email.fromEmail, subject: email.subject || '' };
        const notice = (kind, extra = {}) => notifyTeacher({
            user, kind, ctx: { ...ctx, ...extra }, language, deadlineId: deadline._id, pushSender
        });

        try {
            const existing = await InboxReplyDraft.findOne({
                school: user.school,
                user: user._id,
                email: email._id,
                status: 'draft'
            }).select('_id').lean();
            if (existing) {
                await notice('existingDraft');
                result.skipped += 1;
                continue;
            }

            const summaries = teacher
                ? await buildSubjectSummaries({
                    teacherId: teacher._id,
                    userId: user._id,
                    schoolId: user.school,
                    now
                })
                : [];
            if (!summaries.length) {
                await notice('noPlans');
                result.skipped += 1;
                continue;
            }

            const body = composeNewsletterReplyBody({
                senderFirstName: senderFirstNameOf(email),
                teacherFirstName,
                summaries,
                language
            });
            const subject = replySubject(email.subject);
            const recipients = { to: [email.fromEmail], cc: [] };
            const draftFields = {
                school: user.school,
                user: user._id,
                email: email._id,
                replyType: 'newsletter_auto',
                tone: 'professional',
                language,
                subject,
                body,
                to: recipients.to,
                cc: [],
                source: 'auto'
            };

            if (deliveryMode === 'draft_only') {
                const row = await InboxReplyDraft.create({ ...draftFields, status: 'draft' });
                await saveToGmailDraft(user, row._id);
                await notice('drafted');
                result.drafted += 1;
                continue;
            }

            const mailOptions = buildSendMailOptions({ subject, body, language }, email, recipients);
            const sent = await gmailOAuthService.sendEmail(user._id, mailOptions);
            await InboxReplyDraft.create({
                ...draftFields,
                status: 'sent',
                sentAt: now,
                sentMessageId: sent?.messageId || null,
                threadId: sent?.threadId || email.threadId || null
            });
            await InboxDeadline.updateOne(
                { _id: deadline._id, school: user.school, user: user._id },
                { $set: { state: 'done' } }
            );
            await InboxEmail.updateOne(
                { _id: email._id, school: user.school, user: user._id },
                { $set: { status: 'replied', repliedDetectedAt: now } }
            );
            await notice('sent', { preview: body.replace(/\s+/g, ' ').trim().slice(0, 200) });
            result.sent += 1;
        } catch (error) {
            logger.error('inbox_newsletter_autoreply_failed', {
                user: String(user._id),
                deadline: String(deadline._id),
                code: error?.code,
                error: error?.message
            });
            await notice(error?.code === 'GMAIL_REAUTH_REQUIRED' ? 'reauth' : 'failed');
            result.failed += 1;
        }
    }

    return result;
};

export default { runNewsletterAutoReplyForUser, composeNewsletterReplyBody, deadlineWindow, senderFirstNameOf };