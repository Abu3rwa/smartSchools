/**
 * The item half of a scan: what the new mail says about meetings and deadlines,
 * what it changes about items already saved, and the automatic adds the teacher
 * allowed. Google is only reached through the calendar context.
 */
import InboxDeadline from '../../models/InboxDeadline.js';
import InboxEmail from '../../models/InboxEmail.js';
import InboxEvent from '../../models/InboxEvent.js';
import Notification from '../../models/Notification.js';
import User from '../../models/User.js';
import { NOTIFICATION_TYPES } from '../../constants/notificationTypes.js';
import { buildPortalLink } from '../../helpers/portalUrl.js';
import {
    getDatePartsInTimeZone,
    resolveTimeZone,
    zonedDateTimeToUtc
} from '../../utils/schoolTimezone.js';
import logger from '../../utils/logger.js';
import notificationService from '../notificationService.js';
import { syncItemToCalendar } from './inboxCalendarContext.js';
import { defaultRemindAt, dueSuffixFor } from './inboxDeadlinesService.js';
import { withAssumedEnd } from './inboxEventsService.js';

const OPEN_STATES = Object.freeze(['proposed', 'confirmed']);
/** How far back the same title and date still counts as the same real item. */
const SAME_ITEM_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_TITLE = 200;
const MAX_LOCATION = 300;
const MAX_QUOTE = 300;

const MODEL_OF = { deadline: InboxDeadline, event: InboxEvent };

const cleanText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const sameTitle = (a, b) => cleanText(a, MAX_TITLE).toLowerCase() === cleanText(b, MAX_TITLE).toLowerCase();

const partsOf = (dateText, timeText) => {
    const [year, month, day] = String(dateText).split('-').map(Number);
    const [hour, minute] = String(timeText || '00:00').split(':').map(Number);
    return { year, month, day, hour, minute };
};

const atInTimeZone = (dateText, timeText, timeZone) => (
    zonedDateTimeToUtc(partsOf(dateText, timeText), resolveTimeZone(timeZone))
);

const startOfTodayIn = (timeZone, now) => {
    const tz = resolveTimeZone(timeZone);
    return zonedDateTimeToUtc(getDatePartsInTimeZone(now, tz), tz);
};

const localClockOf = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: resolveTimeZone(timeZone),
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date(date));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
    return { hour: values.hour || 0, minute: values.minute || 0 };
};

const dayTextOf = (date, timeZone) => new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
}).format(new Date(date));

const startOf = (row, kind) => (kind === 'deadline' ? row.dueAt : row.startAt);
const isAllDay = (row, kind) => (kind === 'deadline' ? Boolean(row.dueDateOnly) : Boolean(row.allDay));

/** Shown to the model so it can say which saved item an email is talking about. */
const knownDateText = (row, kind) => {
    const day = dayTextOf(startOf(row, kind), row.timeZone);
    if (isAllDay(row, kind)) return day;
    const { hour, minute } = localClockOf(startOf(row, kind), row.timeZone);
    return `${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const pushKnown = (byThread, threadOfEmail, row, kind) => {
    const threadId = threadOfEmail.get(String(row.email));
    const list = threadId ? byThread.get(threadId) : null;
    if (!list) return;
    list.push({ id: String(row._id), kind, title: row.title, date: knownDateText(row, kind), row });
};

/**
 * The open items in the threads being scanned, keyed by thread. A thread with no
 * open items gets an empty list, so the prompt carries nothing extra for it and
 * the model has no ids to invent.
 */
export const loadKnownItems = async (user, threadIds) => {
    const ids = [...new Set((threadIds || []).map((id) => String(id || '')).filter(Boolean))];
    const byThread = new Map(ids.map((id) => [id, []]));
    if (!ids.length) return byThread;

    const emails = await InboxEmail.find({
        school: user.school,
        user: user._id,
        threadId: { $in: ids }
    }).select('_id threadId').lean();
    if (!emails.length) return byThread;

    const threadOfEmail = new Map(emails.map((row) => [String(row._id), row.threadId]));
    const emailIds = [...threadOfEmail.keys()];
    const base = {
        school: user.school,
        user: user._id,
        email: { $in: emailIds },
        state: { $in: OPEN_STATES }
    };

    const [deadlines, events] = await Promise.all([
        InboxDeadline.find(base).select('_id email title dueAt dueDateOnly timeZone').lean(),
        InboxEvent.find(base).select('_id email title startAt allDay timeZone').lean()
    ]);

    for (const row of deadlines) pushKnown(byThread, threadOfEmail, row, 'deadline');
    for (const row of events) pushKnown(byThread, threadOfEmail, row, 'event');
    return byThread;
};

const localDayRange = (at, timeZone) => {
    const tz = resolveTimeZone(timeZone);
    const parts = getDatePartsInTimeZone(new Date(at), tz);
    const from = zonedDateTimeToUtc(parts, tz);
    const to = zonedDateTimeToUtc({ ...parts, day: parts.day + 1 }, tz);
    return { from, to };
};

/**
 * One real meeting can be mentioned in two emails. The title and the date are
 * enough to see it, so the second mention is dropped instead of becoming a
 * second item and a second calendar event.
 */
const sameItemExists = async (Model, user, kind, { title, at, timeZone, now }) => {
    const { from, to } = localDayRange(at, timeZone);
    const rows = await Model.find({
        school: user.school,
        user: user._id,
        state: { $in: OPEN_STATES },
        createdAt: { $gte: new Date(now.getTime() - SAME_ITEM_WINDOW_MS) },
        ...(kind === 'deadline' ? { dueAt: { $gte: from, $lt: to } } : { startAt: { $gte: from, $lt: to } })
    }).select('title').lean();
    return rows.some((row) => sameTitle(row.title, title));
};

const deadlineFields = (user, email, deadline, timeZone) => ({
    school: user.school,
    user: user._id,
    email: email._id,
    title: cleanText(deadline.title, MAX_TITLE),
    dueAt: atInTimeZone(deadline.dueDate, deadline.dueTime, timeZone),
    dueDateOnly: !deadline.dueTime,
    timeZone,
    quote: cleanText(deadline.quote, MAX_QUOTE),
    state: 'proposed',
    source: 'ai'
});

const eventFields = (user, email, event, timeZone, meetingLengthMinutes) => {
    const allDay = !event.startTime;
    const startAt = atInTimeZone(event.startDate, event.startTime, timeZone);
    const endAt = event.endTime ? atInTimeZone(event.startDate, event.endTime, timeZone) : null;
    // An email may give a start and no end; the length comes from the setting.
    const timed = withAssumedEnd({ startAt, endAt, allDay, meetingLengthMinutes });
    return {
        school: user.school,
        user: user._id,
        email: email._id,
        title: cleanText(event.title, MAX_TITLE),
        startAt,
        endAt: timed.endAt,
        allDay,
        endAssumed: timed.endAssumed,
        timeZone,
        location: cleanText(event.location, MAX_LOCATION),
        quote: cleanText(event.quote, MAX_QUOTE),
        state: 'proposed',
        source: 'ai'
    };
};

const candidateOf = (kind, row, flags, email) => ({
    kind,
    row,
    dateExplicit: Boolean(flags.dateExplicit),
    conflictingDates: Boolean(flags.conflictingDates),
    priority: email.priority,
    senderRole: email.senderRole || '',
    receivedAt: email.receivedAt
});

/**
 * Saves the items one email yielded and returns the ones that are new, each with
 * the flags the auto-add rules need. Items seen before are skipped.
 */
export const saveItemsForEmail = async ({
    user,
    email,
    deadlines = [],
    events = [],
    timeZone,
    meetingLengthMinutes,
    now = new Date()
}) => {
    const created = [];

    for (const deadline of deadlines) {
        const fields = deadlineFields(user, email, deadline, timeZone);
        const seenQuote = await InboxDeadline.findOne({
            school: user.school,
            user: user._id,
            email: email._id,
            quote: fields.quote
        }).select('_id').lean();
        if (seenQuote) continue;
        if (await sameItemExists(InboxDeadline, user, 'deadline', {
            title: fields.title,
            at: fields.dueAt,
            timeZone,
            now
        })) continue;

        const row = await InboxDeadline.create(fields);
        created.push(candidateOf('deadline', row, deadline, email));
    }

    for (const event of events) {
        const fields = eventFields(user, email, event, timeZone, meetingLengthMinutes);
        const seenQuote = await InboxEvent.findOne({
            school: user.school,
            user: user._id,
            email: email._id,
            quote: fields.quote
        }).select('_id').lean();
        if (seenQuote) continue;
        if (await sameItemExists(InboxEvent, user, 'event', {
            title: fields.title,
            at: fields.startAt,
            timeZone,
            now
        })) continue;

        const row = await InboxEvent.create(fields);
        created.push(candidateOf('event', row, event, email));
    }

    return created;
};

/**
 * A later email that moves or cancels a saved item only writes a proposal. The
 * teacher decides; nothing on the calendar changes until they click.
 */
const changePatch = (known, change, { email, meetingLengthMinutes, now }) => {
    const quote = cleanText(change.quote, MAX_QUOTE);
    const base = { quote, email: email._id, detectedAt: now };
    if (change.action === 'cancel') return { ...base, kind: 'cancel' };

    const row = known.row;
    const timeZone = resolveTimeZone(row.timeZone);
    // Only the day moved unless the email gives a new clock time as well.
    const clock = change.newTime
        ? partsOf(change.newDate, change.newTime)
        : { ...partsOf(change.newDate, null), ...localClockOf(startOf(row, known.kind), timeZone) };
    const newStartAt = zonedDateTimeToUtc(clock, timeZone);

    if (known.kind === 'deadline') {
        return {
            ...base,
            kind: 'move',
            newStartAt,
            newAllDay: !change.newTime && Boolean(row.dueDateOnly)
        };
    }
    const allDay = !change.newTime && Boolean(row.allDay);
    const timed = withAssumedEnd({
        startAt: newStartAt,
        endAt: null,
        allDay,
        meetingLengthMinutes
    });
    return {
        ...base,
        kind: 'move',
        newStartAt,
        newEndAt: timed.endAt,
        newAllDay: allDay
    };
};

export const applyItemChanges = async ({
    user,
    email,
    changes = [],
    knownItems = [],
    meetingLengthMinutes,
    now = new Date()
}) => {
    let flagged = 0;
    const byId = new Map(knownItems.map((item) => [item.id, item]));

    for (const change of changes) {
        const known = byId.get(String(change.itemId));
        if (!known) continue;
        const patch = changePatch(known, change, { email, meetingLengthMinutes, now });
        const result = await MODEL_OF[known.kind].updateOne(
            {
                _id: known.row._id,
                school: user.school,
                user: user._id,
                state: { $in: OPEN_STATES }
            },
            { $set: { pendingChange: patch } }
        );
        if (Number(result?.modifiedCount) || Number(result?.nModified)) flagged += 1;
    }
    return flagged;
};

const senderTypeOf = (senderRole) => {
    if (!senderRole) return 'others';
    if (senderRole === 'parent') return 'parents';
    if (senderRole === 'student') return 'others';
    return 'staff';
};

/** Rules 2 to 7 of the auto-add gate. Rule 1 is the exact quote the AI must copy. */
const mayAutoAdd = (candidate, { calendar, now }) => {
    if (!candidate.dateExplicit) return false;
    if (candidate.conflictingDates) return false;
    if (candidate.priority === 'ignore') return false;

    const kind = candidate.kind;
    const timeZone = candidate.row.timeZone || 'UTC';
    const at = new Date(startOf(candidate.row, kind));
    if (Number.isNaN(at.getTime())) return false;
    // A date-only item is still today until the day is over.
    if (isAllDay(candidate.row, kind) ? at < startOfTodayIn(timeZone, now) : at <= now) return false;

    const upper = new Date(candidate.receivedAt);
    if (Number.isNaN(upper.getTime())) return false;
    upper.setUTCFullYear(upper.getUTCFullYear() + 1);
    if (at > upper) return false;

    const senders = calendar.autoAddSenders || {};
    return senders[senderTypeOf(candidate.senderRole)] !== false;
};

/**
 * Puts the allowed new items on the calendar without a click. Every item is
 * confirmed first, so the app never holds an item the teacher cannot see, and a
 * Google failure leaves the row flagged for the retry job instead of throwing.
 */
export const autoAddItems = async ({
    user,
    context,
    candidates = [],
    uiLanguage,
    cap = 10,
    now = new Date()
}) => {
    const result = { added: 0, waiting: 0, failed: 0, overlaps: [] };
    if (!context?.active || context.calendar?.autoAdd !== true) return result;

    const dueSuffix = dueSuffixFor(uiLanguage);
    let budget = Math.max(0, Math.min(50, Math.round(Number(cap) || 10)));

    for (const candidate of candidates) {
        const Model = MODEL_OF[candidate.kind];
        if (!mayAutoAdd(candidate, { calendar: context.calendar, now })) continue;

        if (budget <= 0) {
            // Past the cap the item waits for a click rather than being dropped.
            await Model.updateOne(
                { _id: candidate.row._id, school: user.school, user: user._id },
                { $set: { autoAddWaiting: true } }
            );
            result.waiting += 1;
            continue;
        }
        budget -= 1;

        const timeZone = candidate.row.timeZone || 'UTC';
        const remindAt = candidate.kind === 'deadline'
            ? defaultRemindAt({
                dueAt: candidate.row.dueAt,
                dueDateOnly: candidate.row.dueDateOnly,
                timeZone,
                now
            })
            : null;
        const confirmed = await Model.findOneAndUpdate(
            { _id: candidate.row._id, school: user.school, user: user._id },
            { $set: { state: 'confirmed', ...(remindAt ? { remindAt } : {}) } },
            { new: true }
        ).lean();
        const row = confirmed || { ...candidate.row, state: 'confirmed' };

        const saved = await syncItemToCalendar(user, Model, row, candidate.kind, {
            action: 'add',
            dueSuffix,
            context,
            autoAdded: true,
            now
        });
        const calendar = saved?.calendar || row.calendar || {};
        if (calendar.status === 'synced') result.added += 1;
        else result.failed += 1;
        if (Array.isArray(saved?.overlaps) && saved.overlaps.length) {
            result.overlaps.push({
                title: row.title,
                at: startOf(row, candidate.kind),
                allDay: isAllDay(row, candidate.kind),
                timeZone,
                with: saved.overlaps[0].title
            });
        }
    }

    return result;
};

const WHEN_FORMAT = { dateStyle: 'medium', timeStyle: 'short' };

const whenText = (at, { allDay, timeZone, arabic }) => new Intl.DateTimeFormat(
    arabic ? 'ar' : 'en-GB',
    {
        timeZone: resolveTimeZone(timeZone),
        ...(allDay ? { dateStyle: 'medium' } : WHEN_FORMAT)
    }
).format(new Date(at));

const OVERLAP_COPY = {
    en: {
        subject: 'Overlapping dates in your calendar',
        intro: 'These items from your inbox overlap with something already in your calendar:',
        line: (item) => `${item.title} — ${item.when} — overlaps with ${item.with}`,
        outro: 'Open the Inbox Assistant to change or remove them.'
    },
    ar: {
        // A scan can report any number of overlaps, so neither line commits to a count.
        subject: 'تعارض في تقويمك',
        intro: 'بنود من بريدك الوارد تتعارض مع مواعيد في تقويمك:',
        // The marks keep a Latin title or clock time on the right side of the Arabic.
        line: (item) => `\u200F${item.title}\u200F — \u200F${item.when}\u200F — يتعارض مع \u200F${item.with}\u200F`,
        outro: 'افتح مساعد البريد الوارد لتغييرها أو إزالتها.'
    }
};

/**
 * One email per scan, and only about items this scan added. Titles and times
 * only, to the teacher's own address; a manual add shows the chip instead.
 */
export const sendOverlapEmail = async ({ user, overlaps = [], uiLanguage = 'en' }) => {
    if (!overlaps.length) return false;
    const teacher = await User.findOne({ _id: user._id }).select('email').lean();
    if (!teacher?.email) return false;

    const arabic = String(uiLanguage || '').startsWith('ar');
    const copy = arabic ? OVERLAP_COPY.ar : OVERLAP_COPY.en;
    const lines = overlaps.map((overlap) => copy.line({
        title: overlap.title,
        when: whenText(overlap.at, { allDay: overlap.allDay, timeZone: overlap.timeZone, arabic }),
        with: overlap.with
    }));

    const notification = await Notification.create({
        school: user.school,
        recipient: user._id,
        recipientEmail: teacher.email,
        type: NOTIFICATION_TYPES.INBOX_CALENDAR_OVERLAP,
        subject: copy.subject,
        message: [copy.intro, ...lines, copy.outro].join('\n'),
        channels: ['email'],
        status: 'pending',
        metadata: {
            link: buildPortalLink('/inbox'),
            overlapCount: overlaps.length
        }
    });

    try {
        await notificationService.sendEmail(notification, null);
        return true;
    } catch (error) {
        logger.warn('inbox_calendar_overlap_email_failed', {
            user: String(user._id),
            error: error?.message
        });
        return false;
    }
};
