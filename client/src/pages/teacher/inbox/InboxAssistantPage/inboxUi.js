import { formatCents } from "../../../../utils/aiCredit.js";

export const INBOX_GROUPS = ["needs_reply", "fyi", "ignored"];

/** Urgent mail is work that needs an answer, so it belongs with needs-reply. */
export const groupForEmail = (email = {}) => {
  if (email.priority === "ignore" || email.status === "dismissed") return "ignored";
  if (email.priority === "urgent" || email.priority === "needs_reply") return "needs_reply";
  return "fyi";
};

export const groupInboxEmails = (emails = []) => {
  const groups = { needs_reply: [], fyi: [], ignored: [] };
  for (const email of Array.isArray(emails) ? emails : []) {
    groups[groupForEmail(email)].push(email);
  }
  return groups;
};

export const SENDER_ROLES = [
  "super_admin",
  "admin",
  "department_principal",
  "teacher",
  "staff",
  "parent",
  "student",
];

export const senderRoleKey = (role) => (
  SENDER_ROLES.includes(role) ? `roles.${role}` : ""
);

export const PRIORITY_LEVELS = ["urgent", "needs_reply", "fyi", "ignore"];

export const priorityKey = (priority) => (
  PRIORITY_LEVELS.includes(priority) ? `priority.${priority}` : ""
);

export const formatEstimate = (cents, locale = "en") => formatCents(cents, locale);

/** What the Refresh click should do next: ask, say there is nothing, or refuse. */
export const estimateNotice = (estimate, fallbackBalanceCents = 0) => {
  if (!estimate) return "idle";
  if (Number(estimate.newCount) <= 0) return "empty";
  const cost = Number(estimate.estimateCents) || 0;
  const balance = Number(estimate.creditBalanceCents ?? fallbackBalanceCents) || 0;
  return cost > balance ? "noCredit" : "confirm";
};

const ERROR_KEYS = {
  GMAIL_REAUTH_REQUIRED: "errors.gmailReauth",
  GMAIL_MODIFY_SCOPE_REQUIRED: "errors.gmailReauth",
  AI_CREDIT_REQUIRED: "errors.creditRequired",
  AI_CREDIT_PAUSED: "errors.creditPaused",
  AI_CREDIT_PRICING_REQUIRED: "errors.creditRequired",
  ESTIMATE_CHANGED: "errors.estimateChanged",
  ESTIMATE_REQUIRED: "errors.estimateChanged",
  SCAN_ALREADY_RUNNING: "errors.scanRunning",
  SCAN_DAILY_LIMIT: "errors.dailyLimit",
  DRAFT_DAILY_LIMIT: "errors.draftLimit",
  DRAFT_PLACEHOLDERS: "errors.placeholders",
  INBOX_NOT_OPTED_IN: "errors.notOptedIn",
  CALENDAR_NOT_CONNECTED: "errors.calendarNotConnected",
  CALENDAR_SCOPE_REQUIRED: "errors.calendarScope",
  CALENDAR_REAUTH_REQUIRED: "errors.calendarReauth",
  CALENDAR_DISABLED: "errors.calendarDisabled",
  CALENDAR_RATE_LIMITED: "errors.rateLimited",
  CALENDAR_EVENT_CHANGED: "errors.calendarEventChanged",
};

export const errorMessageKey = (error, fallbackKey = "errors.generic") => {
  const code = error?.response?.data?.code;
  const status = error?.response?.status;
  if (code && ERROR_KEYS[code]) return ERROR_KEYS[code];
  if (status === 402) return "errors.creditRequired";
  if (status === 429) return "errors.rateLimited";
  if (status === 409) return "errors.conflict";
  return fallbackKey;
};

/** Arabic takes a dual and two plural bands, so pick the form before calling t(). */
export const waitingDaysKey = (days, language = "en") => {
  const n = Math.max(0, Math.floor(Number(days) || 0));
  if (String(language).startsWith("ar")) {
    if (n === 1) return "row.waitingOne";
    if (n === 2) return "row.waitingTwo";
    if (n >= 3 && n <= 10) return "row.waitingFew";
    return "row.waitingMany";
  }
  return n === 1 ? "row.waitingOne" : "row.waitingMany";
};

export const clampScanSize = (value, max) => {
  const ceiling = Math.max(10, Math.round(Number(max) || 10));
  const size = Math.round(Number(value) || 0);
  return Math.min(Math.max(size, 10), ceiling);
};

export const REPLY_GROUP_ORDER = [
  "acknowledge",
  "commit",
  "time",
  "ask",
  "say_no",
  "inform",
  "route",
  "chase",
];

/** Must match the server regex exactly, or Send could disagree with the API. */
export const PLACEHOLDER_PATTERN = /\[\[[A-Z_]+\]\]/g;

export const extractPlaceholders = (text) => [
  ...new Set(String(text ?? "").match(PLACEHOLDER_PATTERN) || []),
];

export const isSendAllowed = (draft) => Boolean(
  draft
  && draft.status === "draft"
  && String(draft.subject || "").trim()
  && String(draft.body || "").trim()
  && extractPlaceholders(draft.body).length === 0,
);

/** Keeps an auto-save from sending empty fields the server would reject. */
export const buildDraftPatch = (draft = {}, saved = {}) => {
  const patch = {};
  const subject = String(draft.subject ?? "");
  if (subject.trim() && subject !== String(saved.subject ?? "")) patch.subject = subject;
  const body = String(draft.body ?? "");
  if (body.trim() && body !== String(saved.body ?? "")) patch.body = body;
  if (typeof draft.includeCc === "boolean" && draft.includeCc !== saved.includeCc) {
    patch.includeCc = draft.includeCc;
  }
  return patch;
};

export const hasDraftPatch = (patch) => Object.keys(patch).length > 0;

export const gmailThreadUrl = (threadId) => (
  threadId ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}` : ""
);

/** Same Arabic bands as the waiting badge, for the placeholders-left count. */
export const placeholderCountKey = (n, language = "en") => {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  if (String(language).startsWith("ar")) {
    if (count === 1) return "reply.placeholderCountOne";
    if (count === 2) return "reply.placeholderCountTwo";
    if (count >= 3 && count <= 10) return "reply.placeholderCountFew";
    return "reply.placeholderCountMany";
  }
  return count === 1 ? "reply.placeholderCountOne" : "reply.placeholderCountMany";
};

const pad2 = (value) => String(value).padStart(2, "0");

export const localDateInputValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const localTimeInputValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

export const localDateTimeInputValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${localDateInputValue(date)}T${localTimeInputValue(date)}`;
};

/** Builds the UTC instant for a date (and optional local time) the teacher picked. */
export const instantFromLocalInput = ({ date, time = "" } = {}) => {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  const local = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number.isFinite(hour) ? hour : 0,
    Number.isFinite(minute) ? minute : 0,
    0,
    0,
  );
  return Number.isNaN(local.getTime()) ? "" : local.toISOString();
};

const sameMinute = (a, b) => Math.abs(a - b) < 60 * 1000;

/** The instant behind one "Remind me" option, in the browser's time zone. */
export const reminderFromOption = (option, deadline = {}) => {
  if (option === "none") return null;
  const due = new Date(deadline.dueAt);
  if (Number.isNaN(due.getTime())) return null;
  if (option === "twoHours") return new Date(due.getTime() - 2 * 60 * 60 * 1000).toISOString();
  if (option === "oneDay") {
    return new Date(due.getFullYear(), due.getMonth(), due.getDate() - 1, 8, 0, 0, 0).toISOString();
  }
  return null;
};

export const reminderOptionFor = (deadline = {}) => {
  if (!deadline.remindAt) return "none";
  const remind = new Date(deadline.remindAt).getTime();
  const due = new Date(deadline.dueAt).getTime();
  if (Number.isNaN(remind) || Number.isNaN(due)) return "custom";
  if (!deadline.dueDateOnly && sameMinute(remind, due - 2 * 60 * 60 * 1000)) return "twoHours";
  const oneDay = reminderFromOption("oneDay", deadline);
  if (oneDay && sameMinute(remind, new Date(oneDay).getTime())) return "oneDay";
  return "custom";
};

export const deadlineDateKey = (dueAt, now = new Date()) => {
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "";
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((startOfDay(due) - startOfDay(now)) / (24 * 60 * 60 * 1000));
  if (diff < 0) return "deadlines.overdue";
  if (diff === 0) return "deadlines.today";
  if (diff === 1) return "deadlines.tomorrow";
  return "";
};

export const formatDeadlineDate = (dueAt, { language = "en", dueDateOnly = true } = {}) => {
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return "";
  const locale = String(language).startsWith("ar") ? "ar" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(dueDateOnly ? {} : { timeStyle: "short" }),
  }).format(date);
};

export const CALENDAR_SENDER_GROUPS = ["staff", "parents", "others"];

export const MEETING_LENGTH_LIMITS = { min: 15, max: 240 };

export const clampMeetingLength = (value) => {
  const minutes = Math.round(Number(value) || 0);
  return Math.min(Math.max(minutes, MEETING_LENGTH_LIMITS.min), MEETING_LENGTH_LIMITS.max);
};

/** The banner only makes sense while the platform allows Calendar and it is not on yet. */
export const showCalendarBanner = (calendar = {}) => (
  Boolean(calendar.platformEnabled)
  && (!calendar.connected || calendar.syncOn === false)
);

export const isCalendarUsable = (calendar = {}) => (
  Boolean(calendar.platformEnabled) && Boolean(calendar.connected) && calendar.syncOn !== false
);

const localDayStart = (value = new Date()) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/** The Events tab counts what still needs a look: proposed, plus confirmed and ahead. */
export const eventsTabCount = (events = [], now = new Date()) => (
  (Array.isArray(events) ? events : [])
    .filter((event) => (event.state === "proposed"
      || (event.state === "confirmed" && new Date(event.startAt).getTime() >= localDayStart(now))))
    .length
);

const FAILURE_KEYS = {
  notConnected: "calendar.reasons.notConnected",
  scopeMissing: "calendar.reasons.scopeMissing",
  reauth: "calendar.reasons.reauth",
  apiNotEnabled: "calendar.reasons.apiNotEnabled",
  rateLimited: "calendar.reasons.rateLimited",
  eventChanged: "calendar.reasons.eventChanged",
};

/** The server stores a fixed set of short reason keys, never a raw Google message. */
export const calendarFailureKey = (lastError) => (
  FAILURE_KEYS[lastError] || "calendar.reasons.other"
);

/**
 * Everything one row says about its calendar link, in reading order: what needs a
 * click, then what happened, then a warning about the day.
 */
export const calendarChips = (item = {}) => {
  const calendar = item.calendar || {};
  const change = item.pendingChange;
  const chips = [];

  if (change?.kind === "move") chips.push({ key: "calendar.chips.dateChanged", tone: "is-change" });
  if (change?.kind === "cancel") chips.push({ key: "calendar.chips.cancelled", tone: "is-change" });

  if (calendar.status === "failed") {
    chips.push({
      key: calendar.givenUp ? "calendar.chips.gaveUp" : "calendar.chips.failed",
      tone: "is-failed",
      reasonKey: calendarFailureKey(calendar.lastError),
      link: calendar.htmlLink || "",
    });
  }
  if (calendar.status === "lost") {
    chips.push({ key: "calendar.chips.lost", tone: "is-lost" });
  }
  if (calendar.status === "synced") {
    chips.push({
      key: calendar.autoAdded ? "calendar.chips.autoAdded" : "calendar.chips.added",
      tone: calendar.autoAdded ? "is-auto" : "is-added",
      link: calendar.htmlLink || "",
    });
  }
  if (item.autoAddWaiting && calendar.status !== "synced") {
    chips.push({ key: "calendar.chips.waiting", tone: "is-waiting" });
  }

  const overlap = (Array.isArray(item.overlaps) ? item.overlaps : [])[0];
  if (overlap?.title) {
    chips.push({ key: "calendar.chips.overlap", tone: "is-overlap", title: overlap.title });
  }
  return chips;
};

/** A row already on the calendar is reminded by Google, so the in-app selector goes. */
export const isCalendarSynced = (item = {}) => item.calendar?.status === "synced";

export const eventWindowFromInput = ({ date, startTime = "", endTime = "", allDay = false } = {}) => {
  const startAt = instantFromLocalInput({ date, time: allDay ? "" : startTime });
  if (!startAt) return null;
  if (allDay || !endTime) return { startAt, endAt: null };
  const endAt = instantFromLocalInput({ date, time: endTime });
  if (!endAt || endAt <= startAt) return null;
  return { startAt, endAt };
};

