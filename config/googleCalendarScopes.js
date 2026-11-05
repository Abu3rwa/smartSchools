/**
 * Calendar is requested on its own, never as part of the shared suite: the
 * suite is re-consented by every teacher on every Google connect and a missing
 * scope there breaks the connection outright.
 */
export const GOOGLE_CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export const GOOGLE_CALENDAR_SCOPES = Object.freeze([GOOGLE_CALENDAR_EVENTS_SCOPE]);

export const hasCalendarScope = (scopes = []) => (
    Array.isArray(scopes) && scopes.includes(GOOGLE_CALENDAR_EVENTS_SCOPE)
);
