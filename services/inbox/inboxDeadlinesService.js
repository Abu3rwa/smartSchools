import InboxDeadline from '../../models/InboxDeadline.js';
import InboxEmail from '../../models/InboxEmail.js';
import InboxEvent from '../../models/InboxEvent.js';
import InboxAssistantSettings from '../../models/InboxAssistantSettings.js';
import {
  getDatePartsInTimeZone,
  resolveTimeZone,
  shiftLocalYmd,
  zonedDateTimeToUtc,
} from '../../utils/schoolTimezone.js';
import {
  assertCalendarUsable,
  getCalendarContext,
  syncItemToCalendar,
} from './inboxCalendarContext.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 7;
const REMIND_HOURS_BEFORE = 2;
const REMIND_HOUR = 8;
const DEADLINE_STATES = new Set(['proposed', 'confirmed', 'done', 'dismissed']);
const MAX_TITLE = 200;
const DUE_SUFFIX = { en: '— due', ar: '— الاستحقاق' };

export const dueSuffixFor = (uiLanguage) => (
  String(uiLanguage || '').startsWith('ar') ? DUE_SUFFIX.ar : DUE_SUFFIX.en
);

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

const parseDate = (value, message) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(message);
  return date;
};

const cleanTitle = (value) => {
  const title = String(value ?? '').trim();
  if (!title) throw badRequest('Give the deadline a title.');
  if (title.length > MAX_TITLE) throw badRequest(`Keep the deadline title under ${MAX_TITLE} characters.`);
  return title;
};

/**
 * Default reminder: 08:00 the day before a date-only deadline, or two hours
 * before a timed one. A moment already in the past means no reminder.
 */
export const defaultRemindAt = ({ dueAt, dueDateOnly = false, timeZone = 'UTC', now = new Date() }) => {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const tz = resolveTimeZone(timeZone);
  let remind;
  if (dueDateOnly) {
    const local = getDatePartsInTimeZone(due, tz);
    const previous = shiftLocalYmd(local, -1);
    remind = zonedDateTimeToUtc(
      { year: previous.year, month: previous.month, day: previous.day, hour: REMIND_HOUR, minute: 0 },
      tz,
    );
  } else {
    remind = new Date(due.getTime() - REMIND_HOURS_BEFORE * 60 * 60 * 1000);
  }
  return remind.getTime() > new Date(now).getTime() ? remind : null;
};

export { shapeCalendar, shapePendingChange, shapeOverlaps } from './inboxCalendarShape.js';
import { shapeCalendar, shapePendingChange, shapeOverlaps } from './inboxCalendarShape.js';

export const shapeDeadline = (deadline) => ({
  id: String(deadline._id),
  emailId: deadline.email ? String(deadline.email) : null,
  title: deadline.title,
  dueAt: deadline.dueAt,
  dueDateOnly: Boolean(deadline.dueDateOnly),
  quote: deadline.quote || '',
  state: deadline.state,
  source: deadline.source,
  remindAt: deadline.remindAt || null,
  reminderSentAt: deadline.reminderSentAt || null,
  calendar: shapeCalendar(deadline.calendar),
  pendingChange: shapePendingChange(deadline.pendingChange),
  overlaps: shapeOverlaps(deadline.overlaps),
  autoAddWaiting: Boolean(deadline.autoAddWaiting),
});

const scope = (user) => ({ school: user.school, user: user._id });

const isClosed = (state) => state === 'done' || state === 'dismissed';

/** Open items that need a click: an auto-add held back, a failed sync or a detected change. */
export const NEEDS_ATTENTION = Object.freeze({
  state: { $in: ['proposed', 'confirmed'] },
  $or: [
    { autoAddWaiting: true },
    { 'calendar.status': 'failed' },
    { 'pendingChange.kind': { $ne: null } },
  ],
});

export const listDeadlinesForUser = async (user, query = {}) => {
  const requested = String(query.state || '').trim();
  const states = requested
    ? requested.split(',').map((state) => state.trim()).filter(Boolean)
    : ['proposed', 'confirmed'];
  for (const state of states) {
    if (!DEADLINE_STATES.has(state)) throw badRequest('Choose a valid deadline state.');
  }

  const filter = { ...scope(user), state: { $in: states } };
  if (query.from) filter.dueAt = { $gte: parseDate(query.from, 'Choose a valid start date.') };
  if (query.to) {
    filter.dueAt = { ...(filter.dueAt || {}), $lte: parseDate(query.to, 'Choose a valid end date.') };
  }

  const rows = await InboxDeadline.find(filter).sort({ dueAt: 1 }).lean();
  return rows.map(shapeDeadline);
};

export const createDeadlineForUser = async (user, body = {}, { now = new Date() } = {}) => {
  const title = cleanTitle(body.title);
  const dueAt = parseDate(body.dueAt, 'Choose a valid date.');
  const dueDateOnly = body.dueDateOnly === undefined ? true : Boolean(body.dueDateOnly);
  const timeZone = resolveTimeZone(body.timeZone);

  let emailId = null;
  if (body.emailId) {
    const email = await InboxEmail.findOne({ _id: body.emailId, ...scope(user) }).select('_id').lean();
    if (!email) throw notFound('Email not found.');
    emailId = email._id;
  }

  const remindAt = body.remindAt === undefined
    ? defaultRemindAt({ dueAt, dueDateOnly, timeZone, now })
    : (body.remindAt ? parseDate(body.remindAt, 'Choose a valid reminder time.') : null);

  const created = await InboxDeadline.create({
    ...scope(user),
    email: emailId,
    title,
    dueAt,
    dueDateOnly,
    timeZone,
    remindAt,
    state: 'confirmed',
    source: 'manual',
  });

  // Adding by hand is the confirm act, so it goes to the calendar the same way.
  const row = created.toObject ? created.toObject() : created;
  const synced = await syncItemToCalendar(user, InboxDeadline, row, 'deadline', {
    dueSuffix: dueSuffixFor(body.uiLanguage),
  });
  return shapeDeadline(synced || row);
};

export const updateDeadlineForUser = async (user, id, body = {}, { now = new Date() } = {}) => {
  const existing = await InboxDeadline.findOne({ _id: id, ...scope(user) }).lean();
  if (!existing) throw notFound('Deadline not found.');

  const patch = {};

  let nextState = existing.state;
  if (body.state !== undefined) {
    nextState = String(body.state);
    if (!DEADLINE_STATES.has(nextState)) throw badRequest('Choose a valid deadline state.');
    patch.state = nextState;
  }

  if (body.title !== undefined) patch.title = cleanTitle(body.title);

  let nextDueAt = existing.dueAt;
  if (body.dueAt !== undefined) {
    nextDueAt = parseDate(body.dueAt, 'Choose a valid date.');
    patch.dueAt = nextDueAt;
  }

  let nextDateOnly = existing.dueDateOnly;
  if (body.dueDateOnly !== undefined) {
    nextDateOnly = Boolean(body.dueDateOnly);
    patch.dueDateOnly = nextDateOnly;
  }

  const timeZone = resolveTimeZone(body.timeZone !== undefined ? body.timeZone : existing.timeZone);
  if (body.timeZone !== undefined) patch.timeZone = timeZone;

  if (body.remindAt !== undefined) {
    patch.remindAt = body.remindAt ? parseDate(body.remindAt, 'Choose a valid reminder time.') : null;
  }

  if (nextState === 'confirmed' && existing.state !== 'confirmed') {
    patch.reminderSentAt = null;
    patch.autoAddWaiting = false;
    if (body.remindAt === undefined) {
      patch.remindAt = defaultRemindAt({
        dueAt: nextDueAt,
        dueDateOnly: nextDateOnly,
        timeZone,
        now,
      });
    }
  } else if (nextState !== 'confirmed' && body.state !== undefined) {
    patch.remindAt = null;
    patch.reminderSentAt = null;
    patch.autoAddWaiting = false;
  }

  let row = await InboxDeadline.findOneAndUpdate(
    { _id: id, ...scope(user) },
    { $set: patch },
    { new: true },
  ).lean();
  if (!row) throw notFound('Deadline not found.');

  const becameConfirmed = nextState === 'confirmed' && existing.state !== 'confirmed';
  const becameClosed = isClosed(nextState) && !isClosed(existing.state);
  const detailsMoved = patch.dueAt !== undefined
    || patch.dueDateOnly !== undefined
    || patch.title !== undefined;

  const action = becameConfirmed || (detailsMoved && !isClosed(nextState) && row.calendar?.eventId)
    ? 'add'
    : (becameClosed && row.calendar?.eventId ? 'remove' : null);

  if (action) {
    const synced = await syncItemToCalendar(user, InboxDeadline, row, 'deadline', {
      action,
      dueSuffix: dueSuffixFor(body.uiLanguage),
    });
    if (synced) row = synced;
  }

  return shapeDeadline(row);
};

export const deleteDeadlineForUser = async (user, id) => {
  const existing = await InboxDeadline.findOne({ _id: id, ...scope(user) }).lean();
  if (!existing) throw notFound('Deadline not found.');
  if (existing.calendar?.eventId) {
    await syncItemToCalendar(user, InboxDeadline, existing, 'deadline', { action: 'remove' });
  }
  await InboxDeadline.deleteOne({ _id: id, ...scope(user) });
  return { deleted: true, id: String(existing._id) };
};

/** One click on "Add to calendar" or "Retry"; safe to call twice. */
export const addToCalendarForUser = async (user, id, body = {}) => {
  const existing = await InboxDeadline.findOne({ _id: id, ...scope(user) }).lean();
  if (!existing) throw notFound('Deadline not found.');
  const context = await getCalendarContext(user);
  assertCalendarUsable(context);
  const synced = await syncItemToCalendar(user, InboxDeadline, existing, 'deadline', {
    dueSuffix: dueSuffixFor(body.uiLanguage),
    context,
  });
  return shapeDeadline(synced || existing);
};

/** "Remove from calendar" and the auto-add Undo; the app row always survives. */
export const removeFromCalendarForUser = async (user, id, { dismiss = false, now = new Date() } = {}) => {
  const existing = await InboxDeadline.findOne({ _id: id, ...scope(user) }).lean();
  if (!existing) throw notFound('Deadline not found.');

  let row = await syncItemToCalendar(user, InboxDeadline, existing, 'deadline', {
    action: 'remove',
    now,
  }) || existing;

  const patch = {};
  if (dismiss) {
    // Dismissing stops the next scan from proposing the same item again.
    patch.state = 'dismissed';
    patch.remindAt = null;
    patch.reminderSentAt = null;
    patch.autoAddWaiting = false;
  } else if (row.calendar?.status === 'removed' && row.state === 'confirmed' && !row.reminderSentAt) {
    // Off the calendar, so the in-app reminder takes over again.
    const remindAt = defaultRemindAt({
      dueAt: row.dueAt,
      dueDateOnly: row.dueDateOnly,
      timeZone: row.timeZone,
      now,
    });
    if (remindAt) patch.remindAt = remindAt;
  }

  if (Object.keys(patch).length > 0) {
    const updated = await InboxDeadline.findOneAndUpdate(
      { _id: id, ...scope(user) },
      { $set: patch },
      { new: true },
    ).lean();
    if (updated) row = updated;
  }

  return shapeDeadline(row);
};

/** A later email moved or cancelled this deadline; nothing changes until here. */
export const decideDeadlineChangeForUser = async (user, id, body = {}, { now = new Date() } = {}) => {
  const existing = await InboxDeadline.findOne({ _id: id, ...scope(user) }).lean();
  if (!existing) throw notFound('Deadline not found.');

  const change = existing.pendingChange;
  if (!change?.kind) throw badRequest('There is no change waiting on this deadline.');
  const decision = String(body.decision || '').trim();
  if (decision !== 'apply' && decision !== 'keep') throw badRequest('Choose apply or keep.');

  if (decision === 'keep') {
    const kept = await InboxDeadline.findOneAndUpdate(
      { _id: id, ...scope(user) },
      { $unset: { pendingChange: 1 } },
      { new: true },
    ).lean();
    return shapeDeadline(kept || existing);
  }

  if (change.kind === 'cancel') {
    let row = await InboxDeadline.findOneAndUpdate(
      { _id: id, ...scope(user) },
      {
        $set: { state: 'dismissed', remindAt: null, reminderSentAt: null, autoAddWaiting: false },
        $unset: { pendingChange: 1 },
      },
      { new: true },
    ).lean();
    if (row?.calendar?.eventId) {
      row = await syncItemToCalendar(user, InboxDeadline, row, 'deadline', { action: 'remove' }) || row;
    }
    return shapeDeadline(row || existing);
  }

  const dueAt = change.newStartAt ? new Date(change.newStartAt) : null;
  if (!dueAt || Number.isNaN(dueAt.getTime())) throw badRequest('The suggested date is not valid.');
  const dueDateOnly = change.newAllDay === null || change.newAllDay === undefined
    ? Boolean(existing.dueDateOnly)
    : Boolean(change.newAllDay);

  const patch = {
    dueAt,
    dueDateOnly,
    remindAt: existing.state === 'confirmed'
      ? defaultRemindAt({ dueAt, dueDateOnly, timeZone: existing.timeZone, now })
      : null,
    reminderSentAt: null,
  };

  let row = await InboxDeadline.findOneAndUpdate(
    { _id: id, ...scope(user) },
    { $set: patch, $unset: { pendingChange: 1 } },
    { new: true },
  ).lean();
  if (!row) throw notFound('Deadline not found.');

  if (row.calendar?.eventId) {
    const synced = await syncItemToCalendar(user, InboxDeadline, row, 'deadline', {
      dueSuffix: dueSuffixFor(body.uiLanguage),
    });
    if (synced) row = synced;
  }

  return shapeDeadline(row);
};

export const getSummaryForUser = async (user, { now = new Date() } = {}) => {
  const settings = await InboxAssistantSettings.findOne(scope(user)).select('nudgeAfterDays').lean();
  const nudgeAfterDays = Math.max(1, Number(settings?.nudgeAfterDays) || 2);
  const waitingCutoff = new Date(now.getTime() - nudgeAfterDays * DAY_MS);
  const dueSoonEnd = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
  const base = scope(user);
  const openWaiting = { ...base, status: 'open', priority: { $in: ['urgent', 'needs_reply'] } };

  const [
    needsReply,
    waiting,
    deadlinesDueSoon,
    overdue,
    proposedDeadlines,
    proposedEvents,
    upcomingEvents,
    deadlineAttention,
    eventAttention,
  ] = await Promise.all([
    InboxEmail.countDocuments(openWaiting),
    InboxEmail.countDocuments({ ...openWaiting, receivedAt: { $lte: waitingCutoff } }),
    InboxDeadline.countDocuments({
      ...base, state: 'confirmed', dueAt: { $gte: now, $lte: dueSoonEnd },
    }),
    InboxDeadline.countDocuments({ ...base, state: 'confirmed', dueAt: { $lt: now } }),
    InboxDeadline.countDocuments({ ...base, state: 'proposed' }),
    InboxEvent.countDocuments({ ...base, state: 'proposed' }),
    InboxEvent.countDocuments({ ...base, state: { $in: ['proposed', 'confirmed'] }, startAt: { $gte: now } }),
    InboxDeadline.countDocuments({ ...base, ...NEEDS_ATTENTION }),
    InboxEvent.countDocuments({ ...base, ...NEEDS_ATTENTION }),
  ]);

  return {
    needsReply,
    waiting,
    deadlinesDueSoon,
    overdue,
    proposedDeadlines,
    proposedEvents,
    upcomingEvents,
    calendarAttention: deadlineAttention + eventAttention,
  };
};
