/**
 * One place that answers "may this teacher write to Calendar right now?" and
 * supplies the email context a calendar description is built from.
 */
import InboxAssistantSettings from '../../models/InboxAssistantSettings.js';
import InboxEmail from '../../models/InboxEmail.js';
import gmailOAuthService from '../gmailOAuthService.js';
import { hasCalendarScope } from '../../config/googleCalendarScopes.js';
import { getPlatformInboxSettings } from '../inboxSettingsService.js';
import { MAX_SYNC_ATTEMPTS, RETRY_BASE_MS } from '../../models/inboxCalendarFields.js';
import inboxCalendarService, { toCalendarItem } from './inboxCalendarService.js';

export const CALENDAR_SETTINGS_DEFAULTS = Object.freeze({
    syncOn: true,
    autoAdd: false,
    autoAddSenders: Object.freeze({ staff: true, parents: true, others: true }),
    meetingLengthMinutes: 60,
    deadlineReminderDateOnlyMinutes: 960,
    deadlineReminderTimedMinutes: 120,
    meetingReminderMinutes: 30,
    overlapEmail: true,
});

export const normalizeCalendarSettings = (value) => ({
    ...CALENDAR_SETTINGS_DEFAULTS,
    ...(value || {}),
    autoAddSenders: {
        ...CALENDAR_SETTINGS_DEFAULTS.autoAddSenders,
        ...(value?.autoAddSenders || {}),
    },
});

export const calendarStatusFrom = (tokenStatus) => {
    const connected = Boolean(tokenStatus?.connected) && hasCalendarScope(tokenStatus?.grantedScopes);
    return {
        connected,
        needsReconnect: Boolean(tokenStatus?.requiresReauth)
            || (Boolean(tokenStatus?.connected) && !connected),
        accountEmail: connected ? tokenStatus?.email || null : null,
    };
};

export const calendarStatusFor = async (user) => calendarStatusFrom(
    await gmailOAuthService.getTokenStatus(user._id),
);

export const getCalendarContext = async (user) => {
    const [platform, settingsRow] = await Promise.all([
        getPlatformInboxSettings(),
        InboxAssistantSettings.findOne({ school: user.school, user: user._id })
            .select('calendar autoAdd')
            .lean(),
    ]);
    const calendar = normalizeCalendarSettings(settingsRow?.calendar);
    const platformEnabled = Boolean(platform.calendarEnabled);
    // With the platform switch off there is no reason to look at the Google token.
    const status = platformEnabled
        ? await calendarStatusFor(user)
        : { connected: false, needsReconnect: false, accountEmail: null };
    return {
        platform,
        settings: { ...(settingsRow || {}), calendar },
        calendar,
        status,
        platformEnabled,
        syncOn: calendar.syncOn !== false,
        active: platformEnabled && status.connected && calendar.syncOn !== false,
    };
};

/** Sender and thread details for the description template; never the email body. */
export const emailContextFor = async (user, emailId) => {
    if (!emailId) return {};
    const email = await InboxEmail.findOne({
        _id: emailId,
        school: user.school,
        user: user._id,
    })
        .select('threadId gmailMessageId fromName fromEmail senderRole summary priority')
        .lean();
    if (!email) return {};
    return {
        threadId: email.threadId || '',
        gmailMessageId: email.gmailMessageId || '',
        senderName: email.fromName || email.fromEmail || '',
        senderRole: email.senderRole || '',
        summary: email.summary || '',
        priority: email.priority || '',
    };
};

const calendarError = (code, statusCode, message) => Object.assign(new Error(message), { statusCode, code });

/** Only for an explicit click: the teacher needs a reason, not a silent no-op. */
export const assertCalendarUsable = (context) => {
    if (!context.platformEnabled) {
        throw calendarError('CALENDAR_DISABLED', 403, 'Google Calendar is not available here.');
    }
    if (!context.status.connected) {
        if (context.status.needsReconnect) {
            throw calendarError('CALENDAR_REAUTH_REQUIRED', 401, 'Reconnect Google to use Calendar.');
        }
        throw calendarError('CALENDAR_NOT_CONNECTED', 409, 'Connect Google Calendar first.');
    }
    if (context.syncOn === false) {
        throw calendarError('CALENDAR_DISABLED', 403, 'Calendar sync is turned off in your settings.');
    }
};

const attemptAt = (attempts, now) => new Date(now.getTime() + RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));

const failedPatch = (calendar, outcome, now) => {
    const attempts = Math.min(MAX_SYNC_ATTEMPTS, (Number(calendar?.attempts) || 0) + 1);
    return {
        ...calendar,
        status: 'failed',
        lastError: outcome.error,
        attempts,
        nextAttemptAt: attemptAt(attempts, now),
        linkLost: false,
    };
};

/**
 * The app changes first and Google follows, so a calendar failure never blocks
 * the teacher: it lands on the row and the hourly job retries it. A removal that
 * fails keeps the event id and is flagged so the retry knows what it still owes.
 */
export const syncItemToCalendar = async (user, Model, row, kind, {
    action = 'add',
    dueSuffix = '',
    context = null,
    autoAdded = false,
    now = new Date(),
} = {}) => {
    if (!row?._id) return null;
    if (action === 'remove' && !row.calendar?.eventId) return null;
    const active = context || await getCalendarContext(user);
    if (!active.active) return null;

    const extra = await emailContextFor(user, row.email);
    const item = {
        ...toCalendarItem(row, kind, extra),
        threadId: extra.threadId || '',
        calendar: row.calendar || {},
    };

    const outcome = action === 'remove'
        ? await inboxCalendarService.removeItem({ user, item })
        : await inboxCalendarService.updateItem({
            user,
            item,
            settings: active.settings,
            dueSuffix,
        });

    // Overlaps warn but never block: the event is added either way.
    const found = action === 'remove' || !outcome.ok
        ? null
        : await inboxCalendarService.checkOverlaps({ user, item });

    let calendar;
    if (outcome.linkLost) {
        // The teacher changed the event in Google Calendar, so the app lets go of
        // it instead of overwriting their edit or retrying forever.
        calendar = {
            ...row.calendar,
            status: 'lost',
            lastError: outcome.error,
            attempts: 0,
            nextAttemptAt: null,
            pendingRemoval: false,
            linkLost: true,
        };
    } else if (action === 'remove') {
        // The id is dropped on success so a later add reuses it and restores the
        // cancelled stub instead of leaving the row pointing at a deleted event.
        calendar = outcome.ok
            ? {
                ...row.calendar,
                status: 'removed',
                eventId: '',
                htmlLink: '',
                syncedAt: null,
                lastError: '',
                attempts: 0,
                nextAttemptAt: null,
                pendingRemoval: false,
                linkLost: false,
                autoAdded: false,
            }
            : { ...failedPatch(row.calendar, outcome, now), pendingRemoval: true };
    } else {
        calendar = outcome.ok
            ? {
                ...row.calendar,
                status: 'synced',
                eventId: outcome.eventId,
                htmlLink: outcome.htmlLink,
                syncedAt: outcome.syncedAt || now,
                lastError: '',
                attempts: 0,
                nextAttemptAt: null,
                pendingRemoval: false,
                linkLost: false,
                // Provenance for the chip: the scan put it there, not a click.
                ...(autoAdded ? { autoAdded: true } : {}),
            }
            : failedPatch(row.calendar, outcome, now);
    }

    const saved = await Model.findOneAndUpdate(
        { _id: row._id, school: row.school, user: row.user },
        { $set: { calendar, ...(found?.ok ? { overlaps: found.overlaps } : {}) } },
        { new: true },
    ).lean();
    return saved || { ...row, calendar };
};

export default { getCalendarContext, emailContextFor, normalizeCalendarSettings };