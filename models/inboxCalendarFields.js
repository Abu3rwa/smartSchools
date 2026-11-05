import mongoose from 'mongoose';

export const CALENDAR_STATUSES = Object.freeze(['none', 'synced', 'failed', 'removed', 'lost']);
export const CHANGE_KINDS = Object.freeze(['move', 'cancel']);
export const MAX_OVERLAPS = 3;
export const MAX_SYNC_ATTEMPTS = 5;
/** Growing gaps between retries: 1h, 2h, 4h, 8h, 16h. */
export const RETRY_BASE_MS = 60 * 60 * 1000;

/** The app's own mark on a Google event. Branding can change, this key cannot. */
export const CALENDAR_APP_TAG = 'classhope-inbox';

const calendarLinkSchema = new mongoose.Schema(
    {
        status: { type: String, enum: CALENDAR_STATUSES, default: 'none' },
        eventId: { type: String, trim: true, maxlength: 1024, default: '' },
        htmlLink: { type: String, trim: true, maxlength: 1000, default: '' },
        syncedAt: { type: Date, default: null },
        lastError: { type: String, trim: true, maxlength: 200, default: '' },
        attempts: { type: Number, default: 0, min: 0, max: MAX_SYNC_ATTEMPTS },
        nextAttemptAt: { type: Date, default: null },
        // Set while a removal still owes a Google call, so the job can retry it.
        pendingRemoval: { type: Boolean, default: false },
        autoAdded: { type: Boolean, default: false },
        // The teacher changed or replaced the event in Google, so the app stops
        // touching it and the status becomes 'lost'.
        linkLost: { type: Boolean, default: false },
    },
    { _id: false },
);

const pendingChangeSchema = new mongoose.Schema(
    {
        kind: { type: String, enum: CHANGE_KINDS, default: null },
        newStartAt: { type: Date, default: null },
        newEndAt: { type: Date, default: null },
        newAllDay: { type: Boolean, default: null },
        quote: { type: String, trim: true, maxlength: 300, default: '' },
        email: { type: mongoose.Schema.Types.ObjectId, ref: 'InboxEmail', default: null },
        detectedAt: { type: Date, default: null },
    },
    { _id: false },
);

const overlapSchema = new mongoose.Schema(
    {
        title: { type: String, trim: true, maxlength: 200, default: '' },
        start: { type: Date, default: null },
        end: { type: Date, default: null },
    },
    { _id: false },
);

export const buildCalendarBlock = () => ({
    type: calendarLinkSchema,
    default: () => ({}),
});

export const buildPendingChangeBlock = () => ({
    type: pendingChangeSchema,
    default: () => ({}),
});

export const buildOverlapsBlock = () => ({
    type: [overlapSchema],
    default: [],
    validate: {
        validator: (list) => list.length <= MAX_OVERLAPS,
        message: `Keep at most ${MAX_OVERLAPS} overlaps.`,
    },
});

/** The three calendar blocks every inbox item carries, ready to spread into a schema. */
export const inboxCalendarItemFields = () => ({
    calendar: buildCalendarBlock(),
    pendingChange: buildPendingChangeBlock(),
    overlaps: buildOverlapsBlock(),
    autoAddWaiting: { type: Boolean, default: false },
});
