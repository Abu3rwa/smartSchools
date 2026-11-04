import InboxDeadline from '../../models/InboxDeadline.js';
import InboxEmail from '../../models/InboxEmail.js';
import InboxAssistantSettings from '../../models/InboxAssistantSettings.js';
import {
  getDatePartsInTimeZone,
  resolveTimeZone,
  shiftLocalYmd,
  zonedDateTimeToUtc,
} from '../../utils/schoolTimezone.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 7;
const REMIND_HOURS_BEFORE = 2;
const REMIND_HOUR = 8;
const DEADLINE_STATES = new Set(['proposed', 'confirmed', 'done', 'dismissed']);
const MAX_TITLE = 200;

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
});

const scope = (user) => ({ school: user.school, user: user._id });

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
  return shapeDeadline(created.toObject ? created.toObject() : created);
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
  }

  const saved = await InboxDeadline.findOneAndUpdate(
    { _id: id, ...scope(user) },
    { $set: patch },
    { new: true },
  ).lean();
  if (!saved) throw notFound('Deadline not found.');
  return shapeDeadline(saved);
};

export const deleteDeadlineForUser = async (user, id) => {
  const deleted = await InboxDeadline.findOneAndDelete({ _id: id, ...scope(user) }).lean();
  if (!deleted) throw notFound('Deadline not found.');
  return { deleted: true, id: String(deleted._id) };
};

export const getSummaryForUser = async (user, { now = new Date() } = {}) => {
  const settings = await InboxAssistantSettings.findOne(scope(user)).select('nudgeAfterDays').lean();
  const nudgeAfterDays = Math.max(1, Number(settings?.nudgeAfterDays) || 2);
  const waitingCutoff = new Date(now.getTime() - nudgeAfterDays * DAY_MS);
  const dueSoonEnd = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
  const base = scope(user);
  const openWaiting = { ...base, status: 'open', priority: { $in: ['urgent', 'needs_reply'] } };

  const [needsReply, waiting, deadlinesDueSoon, overdue, proposedDeadlines] = await Promise.all([
    InboxEmail.countDocuments(openWaiting),
    InboxEmail.countDocuments({ ...openWaiting, receivedAt: { $lte: waitingCutoff } }),
    InboxDeadline.countDocuments({
      ...base, state: 'confirmed', dueAt: { $gte: now, $lte: dueSoonEnd },
    }),
    InboxDeadline.countDocuments({ ...base, state: 'confirmed', dueAt: { $lt: now } }),
    InboxDeadline.countDocuments({ ...base, state: 'proposed' }),
  ]);

  return { needsReply, waiting, deadlinesDueSoon, overdue, proposedDeadlines };
};
