/**
 * The only module that talks to Google Calendar. Every write is a tagged,
 * private, guest-free event on the teacher's primary calendar, and a Google
 * failure becomes item state instead of an exception the caller must handle.
 */
import crypto from 'node:crypto';
import logger from '../../utils/logger.js';
import { getPlatformBranding } from '../platformBrandingService.js';
import gmailOAuthService from '../gmailOAuthService.js';
import { resolveTimeZone } from '../../utils/schoolTimezone.js';
import {
    CALENDAR_APP_TAG,
    MAX_OVERLAPS,
    MAX_SYNC_ATTEMPTS,
    RETRY_BASE_MS,
} from '../../models/inboxCalendarFields.js';

export const CALENDAR_ERROR_KEYS = Object.freeze([
    'notConnected',
    'scopeMissing',
    'reauth',
    'apiNotEnabled',
    'rateLimited',
    'eventChanged',
    'other',
]);

const TIMED_DEADLINE_MINUTES = 15;
const MAX_TITLE = 200;
const MAX_QUOTE = 300;
const MAX_DESCRIPTION = 1500;
const RATE_LIMIT_BACKOFF_MS = 700;
const PER_USER_DELAY_MS = 120;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One call at a time per teacher, so a scan that syncs many items cannot hit
 * the same quota from several requests at once.
 */
const queues = new Map();
const enqueue = (userId, task) => {
    const key = String(userId);
    const tail = queues.get(key) || Promise.resolve();
    const run = tail
        .catch(() => undefined)
        .then(async () => {
            const result = await task();
            await delay(PER_USER_DELAY_MS);
            return result;
        });
    queues.set(key, run.catch(() => undefined));
    return run;
};

/** Google event ids allow letters and digits only; a hex digest always fits. */
export const calendarEventId = (kind, itemId) => crypto
    .createHash('sha256')
    .update(`${CALENDAR_APP_TAG}:${kind}:${String(itemId)}`)
    .digest('hex');

const stripUrls = (value) => String(value ?? '').replace(/https?:\/\/\S+/gi, ' ');

export const cleanCalendarTitle = (value, { suffix = '' } = {}) => {
    // Email text is data: no control characters, no links, no line breaks.
    const base = stripUrls(value)
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const title = suffix ? `${base} ${suffix}`.trim() : base;
    return title.slice(0, MAX_TITLE);
};

export const gmailThreadLink = (accountEmail, threadId) => {
    const id = String(threadId || '').trim();
    if (!id) return '';
    const authuser = String(accountEmail || '').trim();
    const query = authuser ? `?authuser=${encodeURIComponent(authuser)}` : '';
    return `https://mail.google.com/mail/${query}#all/${encodeURIComponent(id)}`;
};

/** Fixed template only. Raw email body text never reaches the description. */
export const buildCalendarDescription = ({
    summary = '',
    quote = '',
    senderName = '',
    senderRole = '',
    threadLink = '',
    appName = '',
}) => {
    const lines = [
        String(summary || '').replace(/\s+/g, ' ').trim().slice(0, 200),
        quote ? `"${String(quote).slice(0, MAX_QUOTE)}"` : '',
        senderName || senderRole
            ? `From: ${[String(senderName || '').trim(), String(senderRole || '').trim()]
                .filter(Boolean)
                .join(' · ')}`
            : '',
        threadLink ? `Email: ${threadLink}` : '',
        appName ? `Added by ${appName}` : '',
    ];
    return lines.filter(Boolean).join('\n').slice(0, MAX_DESCRIPTION);
};

const localParts = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(date));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return {
        date: `${values.year}-${values.month}-${values.day}`,
        time: `${values.hour}:${values.minute}:${values.second}`,
    };
};

const reminderMinutes = ({ kind, allDay, settings }) => {
    const calendar = settings?.calendar || {};
    if (kind === 'event') {
        return Math.max(0, Math.round(Number(calendar.meetingReminderMinutes ?? 30)));
    }
    return allDay
        ? Math.max(0, Math.round(Number(calendar.deadlineReminderDateOnlyMinutes ?? 960)))
        : Math.max(0, Math.round(Number(calendar.deadlineReminderTimedMinutes ?? 120)));
};

/**
 * One item becomes exactly one event body. Deadlines with a time get a short
 * block because Google needs a duration; date-only items become all-day.
 */
export const buildEventBody = ({ item, settings, appName, threadLink, dueSuffix = '' }) => {
    const timeZone = resolveTimeZone(item.timeZone);
    const start = new Date(item.startAt);
    const end = item.endAt ? new Date(item.endAt) : null;
    const allDay = Boolean(item.allDay);
    const startParts = localParts(start, timeZone);
    const tag = {
        app: CALENDAR_APP_TAG,
        kind: item.kind,
        itemId: String(item.id),
        ...(item.gmailMessageId ? { gmailMessageId: String(item.gmailMessageId) } : {}),
    };

    const body = {
        id: calendarEventId(item.kind, item.id),
        summary: cleanCalendarTitle(item.title, { suffix: dueSuffix }),
        description: buildCalendarDescription({
            summary: item.summary,
            quote: item.quote,
            senderName: item.senderName,
            senderRole: item.senderRole,
            threadLink,
            appName,
        }),
        // No attendees, ever: nobody is invited and nobody can invite onward.
        visibility: 'private',
        extendedProperties: { private: tag },
        reminders: {
            useDefault: false,
            overrides: [{ method: 'popup', minutes: reminderMinutes({ kind: item.kind, allDay, settings }) }],
        },
        ...(item.location ? { location: String(item.location).slice(0, 300) } : {}),
    };

    if (allDay) {
        const endParts = localParts(end || start, timeZone);
        // An all-day end is exclusive, so a one-day event ends the next morning.
        const exclusiveEnd = end && endParts.date !== startParts.date
            ? endParts.date
            : nextDay(startParts.date);
        body.start = { date: startParts.date, timeZone };
        body.end = { date: exclusiveEnd, timeZone };
    } else {
        const timedEnd = end && end.getTime() > start.getTime()
            ? end
            : new Date(start.getTime() + TIMED_DEADLINE_MINUTES * 60 * 1000);
        const endParts = localParts(timedEnd, timeZone);
        body.start = { dateTime: `${startParts.date}T${startParts.time}`, timeZone };
        body.end = { dateTime: `${endParts.date}T${endParts.time}`, timeZone };
    }

    return body;
};

const nextDay = (ymd) => {
    const date = new Date(`${ymd}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
};

const errorKeyOf = (error) => {
    const code = error?.code || error?.response?.status;
    const reason = String(error?.response?.data?.error || error?.message || '');
    if (code === 'CALENDAR_SCOPE_REQUIRED' || /CALENDAR_SCOPE_REQUIRED/.test(reason)) return 'scopeMissing';
    if (code === 'CALENDAR_REAUTH_REQUIRED' || /invalid_grant|Reconnect/i.test(reason)) return 'reauth';
    if (/accessNotConfigured|dailyLimitExceeded|backendError/i.test(reason)) return 'apiNotEnabled';
    if (code === 429 || code === 403 || /rateLimitExceeded|userRateLimitExceeded|quota/i.test(reason)) {
        return 'rateLimited';
    }
    if (code === 404) return 'notFound';
    if (code === 409 || code === 410) return 'conflict';
    return 'other';
};

const isRateLimited = (key) => key === 'rateLimited';

const failure = (key) => ({
    ok: false,
    error: CALENDAR_ERROR_KEYS.includes(key) ? key : 'other',
});

/** A deadline or event row, reduced to the fields the calendar write needs. */
export const toCalendarItem = (row, kind, extra = {}) => ({
    id: String(row._id || row.id),
    kind,
    title: row.title,
    startAt: kind === 'deadline' ? row.dueAt : row.startAt,
    endAt: kind === 'deadline' ? null : row.endAt,
    allDay: kind === 'deadline' ? Boolean(row.dueDateOnly) : Boolean(row.allDay),
    timeZone: row.timeZone || extra.timeZone || 'UTC',
    quote: row.quote || '',
    location: row.location || '',
    threadId: extra.threadId || '',
    gmailMessageId: extra.gmailMessageId || '',
    summary: extra.summary || '',
    senderName: extra.senderName || '',
    senderRole: extra.senderRole || '',
});

const tagMatches = (event, item) => {
    const tag = event?.extendedProperties?.private || {};
    return tag.app === CALENDAR_APP_TAG && String(tag.itemId) === String(item.id);
};

/** Google takes the event id from the URL, so an update body must not carry one. */
const withoutId = (body) => {
    const rest = { ...body };
    delete rest.id;
    return rest;
};

class InboxCalendarService {
    constructor({ clientFactory = null, now = () => new Date() } = {}) {
        this.clientFactory = clientFactory;
        this.now = now;
    }

    async clientFor(userId) {
        if (this.clientFactory) return this.clientFactory(userId);
        return gmailOAuthService.getAuthorizedCalendarClient(userId);
    }

    /** A calendar write is allowed only when the platform, the token and the teacher agree. */
    static syncAllowed({ platform, status, settings }) {
        return Boolean(platform?.calendarEnabled)
            && Boolean(status?.connected)
            && settings?.calendar?.syncOn !== false;
    }

    linkOf(data) {
        return {
            ok: true,
            status: 'synced',
            eventId: data?.id || '',
            htmlLink: data?.htmlLink || '',
            syncedAt: this.now(),
            attempts: 0,
        };
    }

    async writeEvent({ user, item, settings, dueSuffix = '', threadLink = '' }) {
        try {
            const { calendar, accountEmail } = await this.clientFor(user._id);
            const branding = await getPlatformBranding();
            const body = buildEventBody({
                item,
                settings,
                appName: branding.appName,
                threadLink: threadLink || gmailThreadLink(accountEmail, item.threadId),
                dueSuffix,
            });

            try {
                const created = await calendar.events.insert({
                    calendarId: 'primary',
                    sendUpdates: 'none',
                    requestBody: body,
                });
                return this.linkOf(created.data);
            } catch (error) {
                const key = errorKeyOf(error);
                // A deleted event keeps its id as a cancelled stub, so re-adding
                // has to reuse it instead of creating a second event.
                if (key !== 'conflict') throw Object.assign(error, { calendarKey: key });
                return this.reuseExisting({ calendar, body, item, user });
            }
        } catch (error) {
            const key = error?.calendarKey || errorKeyOf(error);
            if (isRateLimited(key)) await delay(RATE_LIMIT_BACKOFF_MS);
            logger.warn('inbox_calendar_add_failed', {
                item: item.id,
                kind: item.kind,
                user: String(user._id),
                error: key,
            });
            return failure(key === 'notFound' ? 'other' : key);
        }
    }

    addItem(args) {
        return enqueue(args.user._id, () => this.writeEvent(args));
    }

    async reuseExisting({ calendar, body, item, user }) {
        let existing;
        try {
            existing = await calendar.events.get({ calendarId: 'primary', eventId: body.id });
        } catch (error) {
            const key = errorKeyOf(error);
            // Google has hard-deleted the id, so a fresh one is the only way in.
            if (key === 'notFound' || key === 'conflict') return this.insertWithNewId({ calendar, body });
            throw Object.assign(error, { calendarKey: key });
        }
        if (!tagMatches(existing.data, item)) {
            logger.warn('inbox_calendar_tag_mismatch', { item: item.id, user: String(user._id) });
            return { ok: false, error: 'eventChanged', linkLost: true };
        }
        const updated = await calendar.events.update({
            calendarId: 'primary',
            eventId: body.id,
            sendUpdates: 'none',
            requestBody: { ...withoutId(body), status: 'confirmed' },
        });
        return this.linkOf(updated.data);
    }

    async insertWithNewId({ calendar, body }) {
        const created = await calendar.events.insert({
            calendarId: 'primary',
            sendUpdates: 'none',
            requestBody: { ...withoutId(body), id: crypto.randomBytes(20).toString('hex') },
        });
        return this.linkOf(created.data);
    }

    async rewriteEvent({ user, item, settings, dueSuffix = '', threadLink = '' }) {
        const eventId = item.calendar?.eventId;
        if (!eventId) return this.writeEvent({ user, item, settings, dueSuffix, threadLink });
        try {
            const { calendar, accountEmail } = await this.clientFor(user._id);
            const existing = await calendar.events.get({ calendarId: 'primary', eventId });
            if (!tagMatches(existing.data, item)) {
                return { ok: false, error: 'eventChanged', linkLost: true };
            }
            const branding = await getPlatformBranding();
            const body = buildEventBody({
                item,
                settings,
                appName: branding.appName,
                threadLink: threadLink || gmailThreadLink(accountEmail, item.threadId),
                dueSuffix,
            });
            const updated = await calendar.events.update({
                calendarId: 'primary',
                eventId,
                sendUpdates: 'none',
                requestBody: withoutId(body),
            });
            return this.linkOf(updated.data);
        } catch (error) {
            const key = errorKeyOf(error);
            logger.warn('inbox_calendar_update_failed', {
                item: item.id,
                kind: item.kind,
                user: String(user._id),
                error: key,
            });
            // Gone from Google already: add it again, reusing or replacing the id.
            if (key === 'notFound' || key === 'conflict') {
                return this.writeEvent({ user, item, settings, dueSuffix, threadLink });
            }
            return failure(key);
        }
    }

    updateItem(args) {
        return enqueue(args.user._id, () => this.rewriteEvent(args));
    }

    /** An event already gone is a success: the app only needs it removed. */
    async dropEvent({ user, item }) {
        const eventId = item.calendar?.eventId;
        if (!eventId) return { ok: true, removed: false };
        try {
            const { calendar } = await this.clientFor(user._id);
            const existing = await calendar.events.get({ calendarId: 'primary', eventId });
            if (!tagMatches(existing.data, item)) {
                return { ok: false, error: 'eventChanged', linkLost: true };
            }
            await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'none' });
            logger.info('inbox_calendar_removed', { item: item.id, kind: item.kind });
            return { ok: true, removed: true, eventId };
        } catch (error) {
            const key = errorKeyOf(error);
            if (key === 'notFound' || key === 'conflict') return { ok: true, removed: true, eventId };
            logger.warn('inbox_calendar_remove_failed', {
                item: item.id,
                kind: item.kind,
                user: String(user._id),
                error: key,
            });
            return failure(key);
        }
    }

    removeItem(args) {
        return enqueue(args.user._id, () => this.dropEvent(args));
    }

    /**
     * Overlap check. Reads only what is needed to warn the teacher: free,
     * declined, cancelled and the app's own event for this item are ignored.
     */
    async findOverlaps({ user, item }) {
        if (item.allDay) return { ok: true, overlaps: [] };
        const start = new Date(item.startAt);
        if (Number.isNaN(start.getTime())) return { ok: true, overlaps: [] };
        const end = item.endAt ? new Date(item.endAt) : null;
        const windowEnd = end && end.getTime() > start.getTime()
            ? end
            : new Date(start.getTime() + TIMED_DEADLINE_MINUTES * 60 * 1000);

        try {
            const { calendar } = await this.clientFor(user._id);
            const ownId = calendarEventId(item.kind, item.id);
            const listed = await calendar.events.list({
                calendarId: 'primary',
                timeMin: new Date(start.getTime() - 60 * 60 * 1000).toISOString(),
                timeMax: windowEnd.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 50,
            });
            const overlaps = (listed.data?.items || [])
                .filter((event) => event.id !== ownId)
                .filter((event) => event.status !== 'cancelled')
                .filter((event) => event.transparency !== 'transparent')
                .filter((event) => !(event.attendees || []).some(
                    (attendee) => attendee.self && attendee.responseStatus === 'declined',
                ))
                .filter((event) => {
                    const eventStart = new Date(event.start?.dateTime || event.start?.date);
                    const eventEnd = new Date(event.end?.dateTime || event.end?.date);
                    if (Number.isNaN(eventStart.getTime())) return false;
                    const stop = Number.isNaN(eventEnd.getTime()) ? eventStart : eventEnd;
                    return eventStart < windowEnd && stop > start;
                })
                .slice(0, MAX_OVERLAPS)
                .map((event) => ({
                    title: cleanCalendarTitle(event.summary || ''),
                    start: new Date(event.start?.dateTime || event.start?.date),
                    end: new Date(event.end?.dateTime || event.end?.date),
                }));
            return { ok: true, overlaps };
        } catch (error) {
            const key = errorKeyOf(error);
            logger.warn('inbox_calendar_overlap_failed', {
                item: item.id,
                user: String(user._id),
                error: key,
            });
            return { ok: false, error: key, overlaps: [] };
        }
    }

    checkOverlaps(args) {
        return enqueue(args.user._id, () => this.findOverlaps(args));
    }

    /** Retries owed calls until the attempt cap is reached, with growing gaps. */
    async retryFailed({ models, settingsFor, contextFor = null, limit = 20, now = new Date() }) {
        const results = { retried: 0, synced: 0, removed: 0, givenUp: 0 };

        for (const [Model, kind] of models) {
            if (!Model) continue;
            const rows = await Model.find({
                $or: [{ 'calendar.pendingRemoval': true }, { 'calendar.status': 'failed' }],
                'calendar.attempts': { $lt: MAX_SYNC_ATTEMPTS },
                $and: [{
                    $or: [{ 'calendar.nextAttemptAt': null }, { 'calendar.nextAttemptAt': { $lte: now } }],
                }],
            })
                .sort({ 'calendar.nextAttemptAt': 1 })
                .limit(limit)
                .lean();

            for (const row of rows) {
                const settings = await settingsFor(row);
                // Turning sync off stops every calendar call, retries included.
                if (settings?.calendar?.syncOn === false) continue;
                results.retried += 1;
                const user = { _id: row.user, school: row.school };
                const extra = contextFor ? await contextFor(row) : {};
                const item = {
                    ...toCalendarItem(row, kind, extra),
                    threadId: extra.threadId || '',
                    calendar: row.calendar,
                };
                const outcome = row.calendar?.pendingRemoval
                    ? await this.removeItem({ user, item })
                    : await this.addItem({ user, item, settings });

                const filter = { _id: row._id, school: row.school, user: row.user };

                if (!outcome.ok) {
                    if (outcome.linkLost) {
                        // The teacher edited the event in Google; stop chasing it.
                        await Model.updateOne(filter, {
                            $set: {
                                'calendar.status': 'lost',
                                'calendar.lastError': outcome.error,
                                'calendar.attempts': 0,
                                'calendar.linkLost': true,
                                'calendar.nextAttemptAt': null,
                                'calendar.pendingRemoval': false,
                            },
                        });
                        results.givenUp += 1;
                        continue;
                    }
                    const attempts = Math.min(MAX_SYNC_ATTEMPTS, (row.calendar?.attempts || 0) + 1);
                    await Model.updateOne(filter, {
                        $set: {
                            'calendar.status': 'failed',
                            'calendar.lastError': outcome.error,
                            'calendar.attempts': attempts,
                            'calendar.linkLost': false,
                            'calendar.nextAttemptAt': new Date(
                                now.getTime() + RETRY_BASE_MS * 2 ** (attempts - 1),
                            ),
                        },
                    });
                    if (attempts >= MAX_SYNC_ATTEMPTS) results.givenUp += 1;
                    continue;
                }

                await Model.updateOne(
                    filter,
                    row.calendar?.pendingRemoval
                        ? {
                            $set: {
                                'calendar.status': 'removed',
                                'calendar.eventId': '',
                                'calendar.htmlLink': '',
                                'calendar.pendingRemoval': false,
                                'calendar.lastError': '',
                                'calendar.attempts': 0,
                                'calendar.nextAttemptAt': null,
                                'calendar.linkLost': false,
                            },
                        }
                        : {
                            $set: {
                                'calendar.status': 'synced',
                                'calendar.eventId': outcome.eventId,
                                'calendar.htmlLink': outcome.htmlLink,
                                'calendar.syncedAt': outcome.syncedAt || now,
                                'calendar.lastError': '',
                                'calendar.attempts': 0,
                                'calendar.nextAttemptAt': null,
                                'calendar.linkLost': false,
                            },
                        },
                );
                if (row.calendar?.pendingRemoval) results.removed += 1;
                else results.synced += 1;
            }
        }

        return results;
    }

    /** Removes every tagged event for one teacher, for the delete-my-data option. */
    async removeAllForUser(userId, models, { schoolId = null } = {}) {
        let removed = 0;
        for (const [Model, kind] of models) {
            const rows = await Model.find({
                user: userId,
                ...(schoolId ? { school: schoolId } : {}),
                'calendar.eventId': { $ne: '' },
            })
                .select('_id school user calendar')
                .lean();
            for (const row of rows) {
                const outcome = await this.removeItem({
                    user: { _id: row.user, school: row.school },
                    item: { ...toCalendarItem(row, kind), calendar: row.calendar },
                });
                if (outcome.ok && outcome.removed) removed += 1;
            }
        }
        return { removed };
    }
}

export const inboxCalendarService = new InboxCalendarService();
export { InboxCalendarService };
export default inboxCalendarService;
