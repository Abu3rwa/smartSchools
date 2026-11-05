import process from 'node:process';
import logger from '../utils/logger.js';
import InboxAssistantSettings from '../models/InboxAssistantSettings.js';
import InboxEmail from '../models/InboxEmail.js';
import InboxDeadline from '../models/InboxDeadline.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { getPlatformInboxSettings } from '../services/inboxSettingsService.js';
import { INBOX_CALENDAR_MODELS } from '../services/inbox/inboxDataService.js';
import inboxCalendarService from '../services/inbox/inboxCalendarService.js';
import { sendPushToUsers } from '../services/pushNotificationService.js';
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js';
import { buildPortalLink } from '../helpers/portalUrl.js';
import { resolveTimeZone } from '../utils/schoolTimezone.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Drops the stored body text once the platform retention window has passed. */
export const purgeOldInboxBodies = async (now = new Date()) => {
    const settings = await getPlatformInboxSettings();
    const days = Math.floor(Number(settings?.rawTextRetentionDays));
    if (!Number.isFinite(days) || days <= 0) return 0;

    const cutoff = new Date(now.getTime() - days * DAY_MS);
    const result = await InboxEmail.updateMany(
        { bodyPurgedAt: null, createdAt: { $lt: cutoff } },
        { $set: { bodyText: '', bodyPurgedAt: now } },
    );
    return Number(result?.modifiedCount) || 0;
};

const reminderContent = (deadline) => {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: resolveTimeZone(deadline.timeZone),
        dateStyle: 'medium',
        ...(deadline.dueDateOnly ? {} : { timeStyle: 'short' }),
    });
    const dateLabel = formatter.format(new Date(deadline.dueAt));
    return {
        subject: 'Deadline reminder',
        message: `${deadline.title} is due on ${dateLabel}.`,
        link: buildPortalLink('/inbox'),
    };
};

/** One reminder per confirmed deadline, even if two job runs overlap. */
const sendDueReminders = async (now, pushSender) => {
    // A deadline on Google Calendar is reminded by Google; a second notice from
    // the app would only be noise. Off the calendar, this runs exactly as before.
    const due = await InboxDeadline.find({
        state: 'confirmed',
        reminderSentAt: null,
        remindAt: { $ne: null, $lte: now },
        'calendar.status': { $ne: 'synced' },
    }).select('_id school user title dueAt dueDateOnly timeZone').lean();
    if (!due.length) return 0;

    const userIds = [...new Set(due.map((deadline) => String(deadline.user)))];
    const users = await User.find({ _id: { $in: userIds } }).select('_id email').lean();
    const usersById = new Map(users.map((user) => [String(user._id), user]));

    let sent = 0;
    for (const deadline of due) {
        const user = usersById.get(String(deadline.user));
        if (!user?.email) continue;

        const claimed = await InboxDeadline.findOneAndUpdate(
            {
                _id: deadline._id,
                state: 'confirmed',
                reminderSentAt: null,
                remindAt: { $lte: now },
                'calendar.status': { $ne: 'synced' },
            },
            { $set: { reminderSentAt: now } },
            { new: true },
        ).lean();
        if (!claimed) continue;

        const content = reminderContent(deadline);
        await Notification.create({
            school: deadline.school,
            recipient: deadline.user,
            recipientEmail: user.email,
            type: NOTIFICATION_TYPES.INBOX_DEADLINE_REMINDER,
            subject: content.subject,
            message: content.message,
            channels: ['push'],
            priority: 'normal',
            metadata: {
                deadlineId: String(deadline._id),
                dueAt: deadline.dueAt,
                link: content.link,
            },
        });
        await pushSender({
            schoolId: deadline.school,
            userIds: [deadline.user],
            title: content.subject,
            body: content.message,
            data: {
                type: 'inbox_deadline',
                notificationType: NOTIFICATION_TYPES.INBOX_DEADLINE_REMINDER,
                deadlineId: String(deadline._id),
                link: content.link,
            },
            collapseKey: 'inbox_deadline',
        }).catch((error) => logger.warn('inbox_deadline_push_failed', {
            error: error?.message,
            deadline: String(deadline._id),
        }));
        sent += 1;
    }
    return sent;
};

/**
 * Google calls the app still owes: an add that failed and a removal that did not
 * go through. Each row carries its own teacher's settings and email context, and
 * a teacher who turned sync off is skipped before any call is made.
 */
export const retryCalendarSync = async (now = new Date()) => {
    const platform = await getPlatformInboxSettings();
    if (!platform.calendarEnabled) return null;

    const settingsCache = new Map();
    const settingsFor = (row) => {
        const key = `${row.school}:${row.user}`;
        if (!settingsCache.has(key)) {
            settingsCache.set(key, InboxAssistantSettings.findOne({
                school: row.school,
                user: row.user,
            }).select('calendar').lean());
        }
        return settingsCache.get(key);
    };

    const contextFor = async (row) => {
        if (!row.email) return {};
        const email = await InboxEmail.findOne({
            _id: row.email,
            school: row.school,
            user: row.user,
        }).select('threadId gmailMessageId summary fromName senderRole').lean();
        if (!email) return {};
        return {
            threadId: email.threadId || '',
            gmailMessageId: email.gmailMessageId || '',
            summary: email.summary || '',
            senderName: email.fromName || '',
            senderRole: email.senderRole || '',
        };
    };

    return inboxCalendarService.retryFailed({
        models: INBOX_CALENDAR_MODELS,
        settingsFor,
        contextFor,
        now,
    });
};

export async function runInboxAssistantJob({
    now = new Date(),
    env = process.env,
    pushSender = sendPushToUsers,
} = {}) {
    if (String(env?.RUN_INBOX_ASSISTANT_JOB).toLowerCase() === 'false') {
        return { skipped: true, purged: 0, remindersSent: 0 };
    }

    let purged = 0;
    let remindersSent = 0;
    let calendarRetried = null;
    try {
        purged = await purgeOldInboxBodies(now);
    } catch (error) {
        logger.error('inbox_assistant_retention_failed', { error: error?.message || String(error) });
    }
    try {
        remindersSent = await sendDueReminders(now, pushSender);
    } catch (error) {
        logger.error('inbox_assistant_reminders_failed', { error: error?.message || String(error) });
    }
    try {
        calendarRetried = await retryCalendarSync(now);
    } catch (error) {
        logger.error('inbox_assistant_calendar_retry_failed', { error: error?.message || String(error) });
    }

    logger.info('inbox_assistant_job_completed', { purged, remindersSent, calendarRetried });
    return { purged, remindersSent, calendarRetried };
}
