import InboxEmail from '../../models/InboxEmail.js';
import InboxEvent from '../../models/InboxEvent.js';
import {
  getDatePartsInTimeZone,
  resolveTimeZone,
  zonedDateTimeToUtc,
} from '../../utils/schoolTimezone.js';
import { shapeCalendar, shapeOverlaps, shapePendingChange } from './inboxCalendarShape.js';
import {
  assertCalendarUsable,
  getCalendarContext,
  syncItemToCalendar,
} from './inboxCalendarContext.js';

const EVENT_STATES = new Set(['proposed', 'confirmed', 'dismissed']);
const MAX_TITLE = 200;
const MAX_LOCATION = 300;
const MAX_QUOTE = 300;

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });

const scope = (user) => ({ school: user.school, user: user._id });

const parseDate = (value, message) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(message);
  return date;
};

const cleanTitle = (value) => {
  const title = String(value ?? '').trim();
  if (!title) throw badRequest('Give the event a title.');
  if (title.length > MAX_TITLE) throw badRequest(`Keep the event title under ${MAX_TITLE} characters.`);
  return title;
};

export const shapeEvent = (event) => ({
  id: String(event._id),
  emailId: event.email ? String(event.email) : null,
  title: event.title,
  startAt: event.startAt,
  endAt: event.endAt,
  allDay: Boolean(event.allDay),
  endAssumed: Boolean(event.endAssumed),
  location: event.location || '',
  quote: event.quote || '',
  state: event.state,
  source: event.source,
  calendar: shapeCalendar(event.calendar),
  pendingChange: shapePendingChange(event.pendingChange),
  overlaps: shapeOverlaps(event.overlaps),
  autoAddWaiting: Boolean(event.autoAddWaiting),
});

const startOfToday = (timeZone, now) => {
  const tz = resolveTimeZone(timeZone);
  return zonedDateTimeToUtc(getDatePartsInTimeZone(now, tz), tz);
};

/**
 * An email may give a start and no end. The assumed length is the teacher's own
 * setting, and the row keeps the fact so the UI can say the end is assumed.
 */
export const withAssumedEnd = ({ startAt, endAt, allDay, meetingLengthMinutes }) => {
  if (allDay) return { endAt: startAt, endAssumed: false };
  const end = endAt ? new Date(endAt) : null;
  if (end && end.getTime() > startAt.getTime()) return { endAt: end, endAssumed: false };
  const minutes = Math.min(240, Math.max(15, Math.round(Number(meetingLengthMinutes) || 60)));
  return { endAt: new Date(startAt.getTime() + minutes * 60 * 1000), endAssumed: true };
};

export const listEventsForUser = async (user, query = {}, { now = new Date() } = {}) => {
  const requested = String(query.state || '').trim();
  const states = requested
    ? requested.split(',').map((state) => state.trim()).filter(Boolean)
    : ['proposed', 'confirmed'];
  for (const state of states) {
    if (!EVENT_STATES.has(state)) throw badRequest('Choose a valid event state.');
  }

  const timeZone = resolveTimeZone(query.timeZone);
  const filter = {
    ...scope(user),
    state: { $in: states },
    // A past meeting is history; it leaves the list on its own date.
    startAt: { $gte: startOfToday(timeZone, now) },
  };

  const rows = await InboxEvent.find(filter).sort({ startAt: 1 }).lean();
  return rows.map(shapeEvent);
};

export const createEventForUser = async (user, body = {}) => {
  const context = await getCalendarContext(user);
  const title = cleanTitle(body.title);
  const startAt = parseDate(body.startAt, 'Choose a valid start date.');
  const allDay = Boolean(body.allDay);
  const timeZone = resolveTimeZone(body.timeZone);
  const endAt = body.endAt ? parseDate(body.endAt, 'Choose a valid end date.') : null;
  if (endAt && endAt.getTime() <= startAt.getTime()) throw badRequest('The end must be after the start.');

  const timed = withAssumedEnd({
    startAt,
    endAt,
    allDay,
    meetingLengthMinutes: context.calendar.meetingLengthMinutes,
  });

  let emailId = null;
  if (body.emailId) {
    const email = await InboxEmail.findOne({ _id: body.emailId, ...scope(user) }).select('_id').lean();
    if (!email) throw notFound('Email not found.');
    emailId = email._id;
  }

  const location = String(body.location ?? '').trim().slice(0, MAX_LOCATION);
  const quote = String(body.quote ?? '').trim().slice(0, MAX_QUOTE);

  const created = await InboxEvent.create({
    ...scope(user),
    email: emailId,
    title,
    startAt,
    endAt: timed.endAt,
    allDay,
    endAssumed: timed.endAssumed,
    timeZone,
    location,
    quote,
    state: 'confirmed',
    source: 'manual',
  });

  const row = created.toObject ? created.toObject() : created;
  const synced = await syncItemToCalendar(user, InboxEvent, row, 'event', { context });
  return shapeEvent(synced || row);
};

export const updateEventForUser = async (user, id, body = {}) => {
  const existing = await InboxEvent.findOne({ _id: id, ...scope(user) }).lean();
  if (!existing) throw notFound('Event not found.');

  const context = await getCalendarContext(user);
  const patch = {};

  let nextState = existing.state;
  if (body.state !== undefined) {
    nextState = String(body.state);
    if (!EVENT_STATES.has(nextState)) throw badRequest('Choose a valid event state.');
    patch.state = nextState;
  }

  if (body.title !== undefined) patch.title = cleanTitle(body.title);
  if (body.location !== undefined) {
    patch.location = String(body.location ?? '').trim().slice(0, MAX_LOCATION);
  }

  const startAt = body.startAt !== undefined
    ? parseDate(body.startAt, 'Choose a valid start date.')
    : existing.startAt;
  if (body.startAt !== undefined) patch.startAt = startAt;

  const allDay = body.allDay !== undefined ? Boolean(body.allDay) : Boolean(existing.allDay);
  if (body.allDay !== undefined) patch.allDay = allDay;

  const explicitEnd = body.endAt !== undefined
    ? (body.endAt ? parseDate(body.endAt, 'Choose a valid end date.') : null)
    : existing.endAt;
  if (explicitEnd && explicitEnd.getTime() <= startAt.getTime()) {
    throw badRequest('The end must be after the start.');
  }

  if (body.startAt !== undefined || body.endAt !== undefined || body.allDay !== undefined) {
    // Moving the start without a new end re-assumes the length from the setting;
    // keeping the old end would silently shorten or stretch the meeting.
    const endInput = body.endAt !== undefined || body.startAt === undefined ? explicitEnd : null;
    const timed = withAssumedEnd({
      startAt,
      endAt: endInput,
      allDay,
      meetingLengthMinutes: context.calendar.meetingLengthMinutes,
    });
    patch.endAt = timed.endAt;
    patch.endAssumed = timed.endAssumed;
  }

  let row = await InboxEvent.findOneAndUpdate(
    { _id: id, ...scope(user) },
    { $set: patch },
    { new: true },
  ).lean();
  if (!row) throw notFound('Event not found.');

  const becameConfirmed = nextState === 'confirmed' && existing.state === 'proposed';
  const becameDismissed = nextState === 'dismissed' && existing.state !== 'dismissed';
  const detailsMoved = patch.startAt !== undefined
    || patch.endAt !== undefined
    || patch.allDay !== undefined
    || patch.title !== undefined
    || patch.location !== undefined;

  const action = becameConfirmed || (detailsMoved && nextState !== 'dismissed' && row.calendar?.eventId)
    ? 'add'
    : (becameDismissed && row.calendar?.eventId ? 'remove' : null);

  if (action) {
    const synced = await syncItemToCalendar(user, InboxEvent, row, 'event', { action, context });
    if (synced) row = synced;
  }

  return shapeEvent(row);
};

export const deleteEventForUser = async (user, id) => {
  const existing = await InboxEvent.findOne({ _id: id, ...scope(user) }).lean();
  if (!existing) throw notFound('Event not found.');
  if (existing.calendar?.eventId) {
    await syncItemToCalendar(user, InboxEvent, existing, 'event', { action: 'remove' });
  }
  await InboxEvent.deleteOne({ _id: id, ...scope(user) });
  return { deleted: true, id: String(existing._id) };
};

export const addEventToCalendarForUser = async (user, id) => {
  const existing = await InboxEvent.findOne({ _id: id, ...scope(user) }).lean();
  if (!existing) throw notFound('Event not found.');
  const context = await getCalendarContext(user);
  assertCalendarUsable(context);
  const synced = await syncItemToCalendar(user, InboxEvent, existing, 'event', { context });
  return shapeEvent(synced || existing);
};

export const removeEventFromCalendarForUser = async (user, id, { dismiss = false, now = new Date() } = {}) => {
  const existing = await InboxEvent.findOne({ _id: id, ...scope(user) }).lean();
  if (!existing) throw notFound('Event not found.');

  let row = await syncItemToCalendar(user, InboxEvent, existing, 'event', {
    action: 'remove',
    now,
  }) || existing;

  if (dismiss) {
    const updated = await InboxEvent.findOneAndUpdate(
      { _id: id, ...scope(user) },
      { $set: { state: 'dismissed', autoAddWaiting: false } },
      { new: true },
    ).lean();
    if (updated) row = updated;
  }

  return shapeEvent(row);
};

export const decideEventChangeForUser = async (user, id, body = {}) => {
  const existing = await InboxEvent.findOne({ _id: id, ...scope(user) }).lean();
  if (!existing) throw notFound('Event not found.');

  const change = existing.pendingChange;
  if (!change?.kind) throw badRequest('There is no change waiting on this event.');
  const decision = String(body.decision || '').trim();
  if (decision !== 'apply' && decision !== 'keep') throw badRequest('Choose apply or keep.');

  if (decision === 'keep') {
    const kept = await InboxEvent.findOneAndUpdate(
      { _id: id, ...scope(user) },
      { $unset: { pendingChange: 1 } },
      { new: true },
    ).lean();
    return shapeEvent(kept || existing);
  }

  if (change.kind === 'cancel') {
    let row = await InboxEvent.findOneAndUpdate(
      { _id: id, ...scope(user) },
      {
        $set: { state: 'dismissed', autoAddWaiting: false },
        $unset: { pendingChange: 1 },
      },
      { new: true },
    ).lean();
    if (row?.calendar?.eventId) {
      row = await syncItemToCalendar(user, InboxEvent, row, 'event', { action: 'remove' }) || row;
    }
    return shapeEvent(row || existing);
  }

  const startAt = change.newStartAt ? new Date(change.newStartAt) : null;
  if (!startAt || Number.isNaN(startAt.getTime())) throw badRequest('The suggested date is not valid.');
  const allDay = change.newAllDay === null || change.newAllDay === undefined
    ? Boolean(existing.allDay)
    : Boolean(change.newAllDay);

  const context = await getCalendarContext(user);
  const endAt = change.newEndAt ? new Date(change.newEndAt) : null;
  const timed = withAssumedEnd({
    startAt,
    endAt,
    allDay,
    meetingLengthMinutes: context.calendar.meetingLengthMinutes,
  });

  let row = await InboxEvent.findOneAndUpdate(
    { _id: id, ...scope(user) },
    {
      $set: {
        startAt,
        endAt: timed.endAt,
        allDay,
        endAssumed: timed.endAssumed,
      },
      $unset: { pendingChange: 1 },
    },
    { new: true },
  ).lean();
  if (!row) throw notFound('Event not found.');

  if (row.calendar?.eventId) {
    const synced = await syncItemToCalendar(user, InboxEvent, row, 'event', { context });
    if (synced) row = synced;
  }

  return shapeEvent(row);
};
