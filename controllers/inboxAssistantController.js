import { asyncHandler } from "../middleware/errorHandler.js";
import InboxAssistantSettings from "../models/InboxAssistantSettings.js";
import InboxEmail from "../models/InboxEmail.js";
import InboxDeadline from "../models/InboxDeadline.js";
import gmailOAuthService, {
  GMAIL_MODIFY_SCOPE,
} from "../services/gmailOAuthService.js";
import { getPlatformInboxSettings } from "../services/inboxSettingsService.js";
import { getCreditBadge } from "../services/aiCreditService.js";
import inboxScanService from "../services/inbox/inboxScanService.js";
import { deleteAllInboxDataForUser } from "../services/inbox/inboxDataService.js";
import {
  calendarStatusFrom,
  normalizeCalendarSettings,
} from "../services/inbox/inboxCalendarContext.js";
import {
  CHECK_TIME_PATTERN,
  MAX_CHECK_TIMES,
  NEWSLETTER_SEND_ENABLED,
  effectiveDeliveryMode,
  normalizeNewsletterAutoReply,
} from "../services/inbox/inboxNewsletterSettings.js";
import {
  HOMEWORK_SEND_ENABLED,
  effectiveHomeworkDeliveryMode,
  normalizeHomeworkAutoReply,
} from "../services/inbox/inboxHomeworkSettings.js";

const TONES = new Set(["professional", "short", "warm", "formal"]);
const STATUSES = new Set(["open", "done", "dismissed", "replied"]);
const EDITABLE_STATUSES = new Set(["open", "done", "dismissed"]);
const GROUPS = new Set(["needs_reply", "deadline", "fyi", "ignored", "all"]);
const PRIORITY_RANK = { urgent: 0, needs_reply: 1, fyi: 2, ignore: 3 };
const MAX_LIST = 300;
const MEETING_LENGTH = { min: 15, max: 240 };
const REMINDER_LIMITS = {
  deadlineReminderDateOnlyMinutes: {
    min: 0,
    max: 4320,
    label: "deadline reminder",
  },
  deadlineReminderTimedMinutes: {
    min: 0,
    max: 1440,
    label: "deadline reminder",
  },
  meetingReminderMinutes: { min: 0, max: 1440, label: "meeting reminder" },
};

const badRequest = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });

const defaultsFor = (platform) => ({
  optedIn: false,
  optedInAt: null,
  scanSize: platform.defaultScanSize,
  autoScanEnabled: false,
  autoScanIntervalMinutes: 60,
  tone: "professional",
  signature: "",
  includeCcByDefault: false,
  nudgeAfterDays: 2,
  customReplyTypes: [],
  calendar: normalizeCalendarSettings(null),
  newsletterAutoReply: normalizeNewsletterAutoReply(null),
  homeworkAutoReply: normalizeHomeworkAutoReply(null),
  lastScanAt: null,
});

const loadSettings = async (user) => {
  const [doc, platform] = await Promise.all([
    InboxAssistantSettings.findOne({
      school: user.school,
      user: user._id,
    }).lean(),
    getPlatformInboxSettings(),
  ]);
  return { settings: doc || defaultsFor(platform), platform };
};

const shapeSettings = (settings) => ({
  optedIn: Boolean(settings.optedIn),
  scanSize: settings.scanSize,
  autoScanEnabled: Boolean(settings.autoScanEnabled),
  autoScanIntervalMinutes: settings.autoScanIntervalMinutes || 60,
  tone: settings.tone,
  signature: settings.signature || "",
  includeCcByDefault: Boolean(settings.includeCcByDefault),
  nudgeAfterDays: settings.nudgeAfterDays,
  customReplyTypes: settings.customReplyTypes || [],
  calendar: normalizeCalendarSettings(settings.calendar),
  newsletterAutoReply: {
    ...normalizeNewsletterAutoReply(settings.newsletterAutoReply),
    sendAvailable: NEWSLETTER_SEND_ENABLED,
  },
  homeworkAutoReply: {
    ...normalizeHomeworkAutoReply(settings.homeworkAutoReply),
    sendAvailable: HOMEWORK_SEND_ENABLED,
  },
  lastScanAt: settings.lastScanAt || null,
});

const clampMinutes = (value, { min, max, label }) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes))
    throw badRequest(`Choose a number of minutes for the ${label}.`);
  const whole = Math.round(minutes);
  if (whole < min || whole > max) {
    throw badRequest(
      `Choose between ${min} and ${max} minutes for the ${label}.`,
    );
  }
  return whole;
};

const AUTO_ADD_SENDER_KEYS = ["staff", "parents", "others"];
const CALENDAR_FLAGS = {
  syncOn: "calendar sync",
  autoAdd: "auto-add",
  overlapEmail: "overlap emails",
};

/** Calendar preferences arrive as a partial patch; anything absent keeps its value. */
const calendarPatch = (incoming, current) => {
  if (incoming === undefined) return null;
  if (
    typeof incoming !== "object" ||
    incoming === null ||
    Array.isArray(incoming)
  ) {
    throw badRequest("Send the calendar settings as an object.");
  }
  const base = normalizeCalendarSettings(current?.calendar);
  const patch = {};

  for (const [field, label] of Object.entries(CALENDAR_FLAGS)) {
    if (incoming[field] === undefined) continue;
    if (typeof incoming[field] !== "boolean")
      throw badRequest(`Turn ${label} on or off.`);
    patch[field] = incoming[field];
  }

  if (incoming.autoAddSenders !== undefined) {
    const senders = incoming.autoAddSenders;
    if (
      typeof senders !== "object" ||
      senders === null ||
      Array.isArray(senders)
    ) {
      throw badRequest("Send the auto-add senders as an object.");
    }
    patch.autoAddSenders = { ...base.autoAddSenders };
    for (const key of AUTO_ADD_SENDER_KEYS) {
      if (senders[key] === undefined) continue;
      if (typeof senders[key] !== "boolean")
        throw badRequest("Turn each sender group on or off.");
      patch.autoAddSenders[key] = senders[key];
    }
  }

  if (incoming.meetingLengthMinutes !== undefined) {
    patch.meetingLengthMinutes = clampMinutes(incoming.meetingLengthMinutes, {
      ...MEETING_LENGTH,
      label: "default meeting length",
    });
  }
  for (const [field, limit] of Object.entries(REMINDER_LIMITS)) {
    if (incoming[field] !== undefined)
      patch[field] = clampMinutes(incoming[field], limit);
  }

  return patch;
};

/** Newsletter auto-reply arrives as a partial patch; enabling needs the risk tick in the same request. */
const newsletterPatch = (incoming, current) => {
  if (incoming === undefined) return null;
  if (
    typeof incoming !== "object" ||
    incoming === null ||
    Array.isArray(incoming)
  ) {
    throw badRequest("Send the newsletter auto-reply settings as an object.");
  }
  const base = normalizeNewsletterAutoReply(current?.newsletterAutoReply);
  const patch = {};

  for (const field of ["enabled", "confirmedRisk"]) {
    if (incoming[field] === undefined) continue;
    if (typeof incoming[field] !== "boolean") {
      throw badRequest("Turn the newsletter auto-reply options on or off.");
    }
    patch[field] = incoming[field];
  }

  // Explicitly turning it on always needs the risk tick in the same request.
  if (patch.enabled === true && incoming.confirmedRisk !== true) {
    throw badRequest(
      "Tick the confirmation that replies can be sent automatically in your name, in the same request.",
    );
  }
  // Withdrawing the risk confirmation is a kill switch, not a half-on state.
  if (patch.confirmedRisk === false) patch.enabled = false;
  const nextEnabled =
    patch.enabled !== undefined ? patch.enabled : base.enabled;
  const nextConfirmed =
    patch.confirmedRisk !== undefined
      ? patch.confirmedRisk
      : base.confirmedRisk;
  if (nextEnabled && !nextConfirmed) {
    throw badRequest(
      "Tick the confirmation that replies can be sent automatically in your name, in the same request.",
    );
  }

  if (incoming.hoursBeforeDeadline !== undefined) {
    const hours = Number(incoming.hoursBeforeDeadline);
    if (!Number.isInteger(hours) || hours < 0 || hours > 24) {
      throw badRequest("Choose between 0 and 24 hours before the deadline.");
    }
    patch.hoursBeforeDeadline = hours;
  }

  if (incoming.deliveryMode !== undefined) {
    if (!["send", "draft_only"].includes(incoming.deliveryMode)) {
      throw badRequest("Choose a delivery mode from the list.");
    }
    patch.deliveryMode = effectiveDeliveryMode(incoming.deliveryMode);
  }

  if (incoming.checkTimes !== undefined) {
    if (!Array.isArray(incoming.checkTimes) || !incoming.checkTimes.length) {
      throw badRequest("Keep at least one check time.");
    }
    if (incoming.checkTimes.length > MAX_CHECK_TIMES) {
      throw badRequest(`Keep at most ${MAX_CHECK_TIMES} check times.`);
    }
    for (const time of incoming.checkTimes) {
      if (typeof time !== "string" || !CHECK_TIME_PATTERN.test(time)) {
        throw badRequest("Write each check time as HH:MM, for example 07:00.");
      }
    }
    patch.checkTimes = [...new Set(incoming.checkTimes)].sort();
  }

  return patch;
};

/** Homework auto-reply arrives as a partial patch; enabling needs the risk tick in the same request. */
const homeworkPatch = (incoming, current) => {
  if (incoming === undefined) return null;
  if (
    typeof incoming !== "object" ||
    incoming === null ||
    Array.isArray(incoming)
  ) {
    throw badRequest("Send the homework auto-reply settings as an object.");
  }
  const base = normalizeHomeworkAutoReply(current?.homeworkAutoReply);
  const patch = {};

  for (const field of ["enabled", "confirmedRisk"]) {
    if (incoming[field] === undefined) continue;
    if (typeof incoming[field] !== "boolean") {
      throw badRequest("Turn the homework auto-reply options on or off.");
    }
    patch[field] = incoming[field];
  }

  // Explicitly turning it on always needs the risk tick in the same request.
  if (patch.enabled === true && incoming.confirmedRisk !== true) {
    throw badRequest(
      "Tick the confirmation that replies can be sent automatically in your name, in the same request.",
    );
  }
  // Withdrawing the risk confirmation is a kill switch, not a half-on state.
  if (patch.confirmedRisk === false) patch.enabled = false;
  const nextEnabled =
    patch.enabled !== undefined ? patch.enabled : base.enabled;
  const nextConfirmed =
    patch.confirmedRisk !== undefined
      ? patch.confirmedRisk
      : base.confirmedRisk;
  if (nextEnabled && !nextConfirmed) {
    throw badRequest(
      "Tick the confirmation that replies can be sent automatically in your name, in the same request.",
    );
  }

  if (incoming.scope !== undefined) {
    if (!["own_subject", "whole_class"].includes(incoming.scope)) {
      throw badRequest("Choose a homework scope from the list.");
    }
    patch.scope = incoming.scope;
  }

  if (incoming.daysAhead !== undefined) {
    const days = Number(incoming.daysAhead);
    if (!Number.isInteger(days) || days < 1 || days > 14) {
      throw badRequest("Choose between 1 and 14 days ahead.");
    }
    patch.daysAhead = days;
  }

  if (incoming.deliveryMode !== undefined) {
    if (!["send", "draft_only"].includes(incoming.deliveryMode)) {
      throw badRequest("Choose a delivery mode from the list.");
    }
    patch.deliveryMode = effectiveHomeworkDeliveryMode(incoming.deliveryMode);
  }

  return patch;
};

const waitingDaysSince = (receivedAt) => {
  const day = 24 * 60 * 60 * 1000;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(receivedAt).getTime()) / day),
  );
};

const isWaitingRow = (email) =>
  (email.priority === "needs_reply" || email.priority === "urgent") &&
  email.status === "open";

const shapeEmail = (email, { nudgeAfterDays, hasOpenDeadline }) => {
  const waiting = isWaitingRow(email);
  const waitingDays = waiting ? waitingDaysSince(email.receivedAt) : null;
  return {
    id: String(email._id),
    fromName: email.fromName || "",
    fromEmail: email.fromEmail || "",
    senderRole: email.senderRole || "",
    subject: email.subject || "",
    receivedAt: email.receivedAt,
    summary: email.summary || "",
    reason: email.reason || "",
    priority: email.priority,
    status: email.status,
    language: email.language,
    suggestedReplyType: email.suggestedReplyType || null,
    hasOpenDeadline: Boolean(hasOpenDeadline),
    waitingDays,
    isWaiting: waitingDays !== null && waitingDays >= nudgeAfterDays,
  };
};

const shapeDetail = (email, nudgeAfterDays, hasOpenDeadline) => ({
  ...shapeEmail(email, { nudgeAfterDays, hasOpenDeadline }),
  bodyText: email.bodyPurgedAt ? "" : email.bodyText || "",
  bodyPurgedAt: email.bodyPurgedAt || null,
});

const openDeadlineEmailIds = async (user, ids) => {
  if (!ids.length) return new Set();
  const found = await InboxDeadline.find({
    school: user.school,
    user: user._id,
    email: { $in: ids },
    state: { $in: ["proposed", "confirmed"] },
  }).distinct("email");
  return new Set(found.map(String));
};

export const getStatus = asyncHandler(async (req, res) => {
  const [{ settings, platform }, tokenStatus, badge] = await Promise.all([
    loadSettings(req.user),
    gmailOAuthService.getTokenStatus(req.user._id),
    getCreditBadge({ schoolId: req.user.school, userId: req.user._id }),
  ]);

  const scopes = tokenStatus.grantedScopes || [];
  const calendar = calendarStatusFrom(tokenStatus);
  const calendarSettings = normalizeCalendarSettings(settings.calendar);
  res.json({
    gmailConnected: Boolean(tokenStatus.connected),
    requiresReauth: Boolean(
      tokenStatus.requiresReauth ||
      (tokenStatus.connected && !scopes.includes(GMAIL_MODIFY_SCOPE)),
    ),
    optedIn: Boolean(settings.optedIn),
    settings: shapeSettings(settings),
    platform: {
      enabled: Boolean(platform.enabled),
      maxScanSize: platform.maxScanSize,
      freeScansPerDay: platform.freeScansPerDay,
      calendarEnabled: Boolean(platform.calendarEnabled),
    },
    calendar: {
      platformEnabled: Boolean(platform.calendarEnabled),
      connected: calendar.connected,
      needsReconnect: calendar.needsReconnect,
      syncOn: calendarSettings.syncOn,
      accountEmail: calendar.accountEmail,
    },
    lastScanAt: settings.lastScanAt || null,
    creditBalanceCents: badge.balanceCents,
  });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const user = req.user;
  const { platform } = await loadSettings(user);
  const current = await InboxAssistantSettings.findOne({
    school: user.school,
    user: user._id,
  }).lean();

  const body = req.body || {};
  const patch = {};
  const optedInAt = {};

  if (body.optedIn !== undefined) {
    if (typeof body.optedIn !== "boolean")
      throw badRequest("Turn Inbox Assistant on or off.");
    patch.optedIn = body.optedIn;
    if (body.optedIn && !current?.optedIn) optedInAt.optedInAt = new Date();
    if (!body.optedIn) optedInAt.optedInAt = null;
  }
  if (body.scanSize !== undefined) {
    const scanSize = Number(body.scanSize);
    if (!Number.isFinite(scanSize))
      throw badRequest("Choose how many emails to scan.");
    patch.scanSize = Math.min(
      Math.max(Math.round(scanSize), 10),
      platform.maxScanSize,
    );
  }
  if (body.autoScanEnabled !== undefined) {
    if (typeof body.autoScanEnabled !== "boolean")
      throw badRequest("Turn automatic scanning on or off.");
    patch.autoScanEnabled = body.autoScanEnabled;
  }
  if (body.autoScanIntervalMinutes !== undefined) {
    const minutes = Number(body.autoScanIntervalMinutes);
    if (!Number.isFinite(minutes))
      throw badRequest("Choose how often to scan automatically.");
    const whole = Math.round(minutes);
    if (whole < 15 || whole > 1440) {
      throw badRequest("Choose between 15 minutes and 24 hours for the scan interval.");
    }
    patch.autoScanIntervalMinutes = whole;
  }
  if (body.tone !== undefined) {
    if (!TONES.has(body.tone))
      throw badRequest("Choose a writing tone from the list.");
    patch.tone = body.tone;
  }
  if (body.signature !== undefined) {
    if (typeof body.signature !== "string" || body.signature.length > 500) {
      throw badRequest("Keep your signature under 500 characters.");
    }
    patch.signature = body.signature.trim();
  }
  if (body.includeCcByDefault !== undefined) {
    if (typeof body.includeCcByDefault !== "boolean") {
      throw badRequest("Choose whether to include Cc by default.");
    }
    patch.includeCcByDefault = body.includeCcByDefault;
  }
  if (body.nudgeAfterDays !== undefined) {
    const days = Number(body.nudgeAfterDays);
    if (!Number.isInteger(days) || days < 1 || days > 14) {
      throw badRequest("Choose between 1 and 14 days for a nudge.");
    }
    patch.nudgeAfterDays = days;
  }

  const calendar = calendarPatch(body.calendar, current);
  if (calendar)
    patch.calendar = {
      ...normalizeCalendarSettings(current?.calendar),
      ...calendar,
    };

  const newsletter = newsletterPatch(body.newsletterAutoReply, current);
  if (newsletter)
    patch.newsletterAutoReply = {
      ...normalizeNewsletterAutoReply(current?.newsletterAutoReply),
      ...newsletter,
    };

  const homework = homeworkPatch(body.homeworkAutoReply, current);
  if (homework)
    patch.homeworkAutoReply = {
      ...normalizeHomeworkAutoReply(current?.homeworkAutoReply),
      ...homework,
    };

  const saved = await InboxAssistantSettings.findOneAndUpdate(
    { school: user.school, user: user._id },
    { $set: { ...patch, ...optedInAt } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  res.json(shapeSettings(saved));
});

export const estimateScan = asyncHandler(async (req, res) => {
  const result = await inboxScanService.estimateScan(req.user, {
    mode: req.body?.mode,
  });
  res.json(result);
});

export const startScan = asyncHandler(async (req, res) => {
  const result = await inboxScanService.runScan(req.user, {
    mode: req.body?.mode,
    acceptedEstimateCents: req.body?.acceptedEstimateCents,
    timeZone: req.body?.timeZone,
    uiLanguage: req.body?.uiLanguage === "ar" ? "ar" : "en",
    reanalyze: req.body?.reanalyze === true,
  });
  res.status(201).json(result);
});

export const listEmails = asyncHandler(async (req, res) => {
  const user = req.user;
  const group = String(req.query.group || "all");
  if (!GROUPS.has(group)) throw badRequest("Choose a valid email group.");

  const { settings } = await loadSettings(user);
  const limit = Math.min(
    Math.max(Math.floor(Number(req.query.limit) || 25), 1),
    100,
  );
  const offset = Math.max(Math.floor(Number(req.query.cursor) || 0), 0);
  const filter = { school: user.school, user: user._id };

  if (req.query.status) {
    if (!STATUSES.has(req.query.status))
      throw badRequest("Choose a valid status.");
    filter.status = req.query.status;
  }
  if (group === "needs_reply")
    filter.priority = { $in: ["urgent", "needs_reply"] };
  if (group === "fyi") filter.priority = "fyi";
  if ((group === "needs_reply" || group === "fyi") && !filter.status) {
    filter.status = { $nin: ["done", "dismissed"] };
  }
  if (group === "ignored")
    filter.$or = [{ priority: "ignore" }, { status: "dismissed" }];
  if (group === "deadline") {
    const emailIds = await InboxDeadline.find({
      school: user.school,
      user: user._id,
      state: { $in: ["proposed", "confirmed"] },
    }).distinct("email");
    filter._id = { $in: emailIds };
    if (!emailIds.length) {
      return res.json({ emails: [], nextCursor: null });
    }
  }

  const rows = await InboxEmail.find(filter)
    .sort({ receivedAt: -1 })
    .limit(MAX_LIST)
    .lean();

  rows.sort((a, b) => {
    const aWaiting = isWaitingRow(a) ? 1 : 0;
    const bWaiting = isWaitingRow(b) ? 1 : 0;
    if (aWaiting !== bWaiting) return bWaiting - aWaiting;
    const rank =
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (rank) return rank;
    return new Date(b.receivedAt) - new Date(a.receivedAt);
  });

  const page = rows.slice(offset, offset + limit);
  const withDeadline = await openDeadlineEmailIds(
    user,
    page.map((row) => row._id),
  );
  const nudgeAfterDays = Number(settings.nudgeAfterDays) || 2;

  res.json({
    emails: page.map((row) =>
      shapeEmail(row, {
        nudgeAfterDays,
        hasOpenDeadline: withDeadline.has(String(row._id)),
      }),
    ),
    nextCursor: offset + limit < rows.length ? String(offset + limit) : null,
  });
});

export const getEmail = asyncHandler(async (req, res) => {
  const user = req.user;
  const email = await InboxEmail.findOne({
    _id: req.params.id,
    school: user.school,
    user: user._id,
  }).lean();
  if (!email) {
    return res
      .status(404)
      .json({ success: false, message: "Email not found." });
  }

  const { settings } = await loadSettings(user);
  const withDeadline = await openDeadlineEmailIds(user, [email._id]);
  res.json(
    shapeDetail(
      email,
      Number(settings.nudgeAfterDays) || 2,
      withDeadline.has(String(email._id)),
    ),
  );
});

export const updateEmail = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!EDITABLE_STATUSES.has(req.body?.status)) {
    throw badRequest("Choose open, done or dismissed.");
  }

  const email = await InboxEmail.findOneAndUpdate(
    { _id: req.params.id, school: user.school, user: user._id },
    { $set: { status: req.body.status } },
    { new: true },
  ).lean();
  if (!email) {
    return res
      .status(404)
      .json({ success: false, message: "Email not found." });
  }

  const { settings } = await loadSettings(user);
  const withDeadline = await openDeadlineEmailIds(user, [email._id]);
  res.json(
    shapeDetail(
      email,
      Number(settings.nudgeAfterDays) || 2,
      withDeadline.has(String(email._id)),
    ),
  );
});

export const deleteData = asyncHandler(async (req, res) => {
  if (req.body?.confirm !== true) {
    throw badRequest(
      "Confirm that you want to delete your Inbox Assistant data.",
    );
  }
  const result = await deleteAllInboxDataForUser(req.user._id, {
    schoolId: req.user.school,
    removeCalendarEvents: req.body?.removeCalendarEvents === true,
  });
  res.json(result);
});
