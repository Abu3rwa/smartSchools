/**
 * Acts only on newsletter deadlines a normal scan already found — this job
 * never drives scanning itself. Each teacher runs only near their own check
 * times; the window + atomic claim in the service are the real safety net.
 */
import process from 'node:process';
import InboxAssistantSettings from '../models/InboxAssistantSettings.js';
import InboxDeadline from '../models/InboxDeadline.js';
import User from '../models/User.js';
import { runNewsletterAutoReplyForUser } from '../services/inbox/inboxNewsletterAutoReplyService.js';
import { isCheckTimeNow } from '../services/inbox/inboxNewsletterSettings.js';
import { getDatePartsInTimeZone, resolveTimeZone } from '../utils/schoolTimezone.js';
import logger from '../utils/logger.js';

/** The teacher's zone as their last scan saw it; settings store no zone of their own. */
const teacherTimeZone = async (settings) => {
    const row = await InboxDeadline.findOne({
        school: settings.school,
        user: settings.user
    }).sort({ updatedAt: -1 }).select('timeZone').lean();
    return resolveTimeZone(row?.timeZone || process.env.DEFAULT_SCHOOL_TIMEZONE);
};

export const runInboxNewsletterAutoReplyJob = async (now = new Date(), { env = process.env, pushSender } = {}) => {
    if (String(env?.RUN_INBOX_NEWSLETTER_AUTOREPLY_JOB).toLowerCase() === 'false') {
        return { skipped: true, teachers: 0, sent: 0, drafted: 0, failed: 0 };
    }

    const rows = await InboxAssistantSettings.find({
        optedIn: true,
        'newsletterAutoReply.enabled': true,
        'newsletterAutoReply.confirmedRisk': true
    }).lean();

    const totals = { teachers: 0, sent: 0, drafted: 0, skipped: 0, failed: 0 };
    for (const settings of rows) {
        try {
            const user = await User.findOne({ _id: settings.user, school: settings.school })
                .select('_id school email firstName lastName')
                .lean();
            if (!user) continue;

            const tz = await teacherTimeZone(settings);
            const local = getDatePartsInTimeZone(now, tz);
            if (!isCheckTimeNow(settings.newsletterAutoReply?.checkTimes, local.hour * 60 + local.minute)) continue;

            const result = await runNewsletterAutoReplyForUser(user, settings, {
                now,
                ...(pushSender ? { pushSender } : {})
            });
            totals.teachers += 1;
            totals.sent += result.sent;
            totals.drafted += result.drafted;
            totals.skipped += result.skipped;
            totals.failed += result.failed;
        } catch (error) {
            logger.error('inbox_newsletter_autoreply_teacher_failed', {
                user: String(settings.user),
                school: String(settings.school),
                error: error?.message
            });
        }
    }

    logger.info('inbox_newsletter_autoreply_job_completed', totals);
    return totals;
};

export default { runInboxNewsletterAutoReplyJob };