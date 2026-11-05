import { MAX_SYNC_ATTEMPTS } from '../../models/inboxCalendarFields.js';

/** Plain state for one row's Google Calendar link; the client turns it into a chip. */
export const shapeCalendar = (calendar) => {
  const attempts = Number(calendar?.attempts) || 0;
  return {
    status: calendar?.status || 'none',
    eventId: calendar?.eventId || '',
    htmlLink: calendar?.htmlLink || '',
    syncedAt: calendar?.syncedAt || null,
    lastError: calendar?.lastError || '',
    attempts,
    givenUp: attempts >= MAX_SYNC_ATTEMPTS,
    pendingRemoval: Boolean(calendar?.pendingRemoval),
    autoAdded: Boolean(calendar?.autoAdded),
    linkLost: Boolean(calendar?.linkLost),
  };
};

export const shapePendingChange = (change) => (change?.kind ? {
  kind: change.kind,
  newStartAt: change.newStartAt || null,
  newEndAt: change.newEndAt || null,
  newAllDay: change.newAllDay === null || change.newAllDay === undefined
    ? null
    : Boolean(change.newAllDay),
  quote: change.quote || '',
  emailId: change.email ? String(change.email) : null,
  detectedAt: change.detectedAt || null,
} : null);

export const shapeOverlaps = (overlaps) => (Array.isArray(overlaps) ? overlaps : [])
  .filter((overlap) => overlap?.title)
  .map((overlap) => ({
    title: overlap.title,
    start: overlap.start || null,
    end: overlap.end || null,
  }));
