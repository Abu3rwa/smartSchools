import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDraftPatch,
  calendarChips,
  calendarFailureKey,
  clampMeetingLength,
  clampScanSize,
  errorMessageKey,
  estimateNotice,
  eventWindowFromInput,
  eventsTabCount,
  extractPlaceholders,
  formatEstimate,
  groupForEmail,
  groupInboxEmails,
  hasDraftPatch,
  instantFromLocalInput,
  isCalendarSynced,
  isCalendarUsable,
  isSendAllowed,
  localDateInputValue,
  localDateTimeInputValue,
  localTimeInputValue,
  priorityKey,
  senderRoleKey,
  showCalendarBanner,
  waitingDaysKey,
} from "./inboxUi.js";

test("urgent mail sits with needs reply, dismissed mail with ignored", () => {
  assert.equal(groupForEmail({ priority: "urgent", status: "open" }), "needs_reply");
  assert.equal(groupForEmail({ priority: "needs_reply", status: "open" }), "needs_reply");
  assert.equal(groupForEmail({ priority: "fyi", status: "open" }), "fyi");
  assert.equal(groupForEmail({ priority: "ignore", status: "open" }), "ignored");
  assert.equal(groupForEmail({ priority: "needs_reply", status: "dismissed" }), "ignored");
});

test("grouping keeps the server order inside each group", () => {
  const emails = [
    { id: "a", priority: "urgent" },
    { id: "b", priority: "fyi" },
    { id: "c", priority: "needs_reply" },
    { id: "d", priority: "ignore" },
  ];
  const groups = groupInboxEmails(emails);
  assert.deepEqual(groups.needs_reply.map((row) => row.id), ["a", "c"]);
  assert.deepEqual(groups.fyi.map((row) => row.id), ["b"]);
  assert.deepEqual(groups.ignored.map((row) => row.id), ["d"]);
  assert.deepEqual(groupInboxEmails(null), { needs_reply: [], fyi: [], ignored: [] });
});

test("an estimate is confirmed only when there is new mail and enough credit", () => {
  assert.equal(estimateNotice(null), "idle");
  assert.equal(estimateNotice({ newCount: 0, estimateCents: 0, creditBalanceCents: 500 }), "empty");
  assert.equal(estimateNotice({ newCount: 4, estimateCents: 2.5, creditBalanceCents: 100 }), "confirm");
  assert.equal(estimateNotice({ newCount: 4, estimateCents: 7, creditBalanceCents: 5 }), "noCredit");
  assert.equal(estimateNotice({ newCount: 4, estimateCents: 7, creditBalanceCents: 500 }), "confirm");
  assert.equal(estimateNotice({ newCount: 4, estimateCents: 7 }, 300), "confirm");
});

test("the estimate is shown as cents in the reader's language", () => {
  assert.equal(formatEstimate(2.5, "en"), "2.5¢");
  assert.equal(formatEstimate(0, "en"), "0¢");
  assert.ok(formatEstimate(12.75, "ar").endsWith("¢"));
});

test("known API codes map to plain error keys, statuses catch the rest", () => {
  const withCode = (code, status = 400) => ({ response: { status, data: { code } } });
  assert.equal(errorMessageKey(withCode("GMAIL_REAUTH_REQUIRED", 401)), "errors.gmailReauth");
  assert.equal(errorMessageKey(withCode("AI_CREDIT_REQUIRED", 402)), "errors.creditRequired");
  assert.equal(errorMessageKey(withCode("AI_CREDIT_PAUSED", 402)), "errors.creditPaused");
  assert.equal(errorMessageKey(withCode("ESTIMATE_CHANGED", 409)), "errors.estimateChanged");
  assert.equal(errorMessageKey(withCode("SCAN_ALREADY_RUNNING", 409)), "errors.scanRunning");
  assert.equal(errorMessageKey(withCode("SCAN_DAILY_LIMIT", 429)), "errors.dailyLimit");
  assert.equal(errorMessageKey(withCode("DRAFT_DAILY_LIMIT", 429)), "errors.draftLimit");
  assert.equal(errorMessageKey(withCode("DRAFT_PLACEHOLDERS", 422)), "errors.placeholders");
  assert.equal(errorMessageKey({ response: { status: 429, data: {} } }), "errors.rateLimited");
  assert.equal(errorMessageKey({ response: { status: 409, data: {} } }), "errors.conflict");
  assert.equal(errorMessageKey({ response: { status: 500, data: {} } }), "errors.generic");
  assert.equal(errorMessageKey(new Error("network")), "errors.generic");
  assert.equal(errorMessageKey(new Error("network"), "reply.sendFailed"), "reply.sendFailed");
});

test("Arabic waiting badges use the dual and both plural bands", () => {
  assert.equal(waitingDaysKey(1), "row.waitingOne");
  assert.equal(waitingDaysKey(1, "ar"), "row.waitingOne");
  assert.equal(waitingDaysKey(2, "ar"), "row.waitingTwo");
  assert.equal(waitingDaysKey(3, "ar"), "row.waitingFew");
  assert.equal(waitingDaysKey(10, "ar"), "row.waitingFew");
  assert.equal(waitingDaysKey(11, "ar"), "row.waitingMany");
  assert.equal(waitingDaysKey(3, "en"), "row.waitingMany");
});

test("role and priority chips are only shown for known values", () => {
  assert.equal(senderRoleKey("admin"), "roles.admin");
  assert.equal(senderRoleKey("student"), "roles.student");
  assert.equal(senderRoleKey(""), "");
  assert.equal(priorityKey("urgent"), "priority.urgent");
  assert.equal(priorityKey("other"), "");
});

test("the scan size never drops under 10 or over the platform maximum", () => {
  assert.equal(clampScanSize(4, 50), 10);
  assert.equal(clampScanSize(25, 50), 25);
  assert.equal(clampScanSize(90, 50), 50);
  assert.equal(clampScanSize("", 50), 10);
  assert.equal(clampScanSize(15, 5), 10);
});

test("placeholders are the upper-case [[NAME]] tokens the server also finds", () => {
  assert.deepEqual(
    extractPlaceholders("I will do it by [[DATE]] and send [[DETAILS]]."),
    ["[[DATE]]", "[[DETAILS]]"],
  );
  assert.deepEqual(extractPlaceholders("[[DATE]] and [[DATE]] again"), ["[[DATE]]"]);
  assert.deepEqual(extractPlaceholders("[[date]] is not a placeholder"), []);
  assert.deepEqual(extractPlaceholders("plain [DATE] and [[DATE"), []);
  assert.deepEqual(extractPlaceholders(""), []);
  assert.deepEqual(extractPlaceholders(null), []);
});

test("Send is allowed only for a saved draft with text and no placeholders", () => {
  const ready = { status: "draft", subject: "Re: Report", body: "Thank you, I will review it." };
  assert.equal(isSendAllowed(ready), true);
  assert.equal(isSendAllowed({ ...ready, status: "sent" }), false);
  assert.equal(isSendAllowed({ ...ready, status: "sending" }), false);
  assert.equal(isSendAllowed({ ...ready, status: "discarded" }), false);
  assert.equal(isSendAllowed({ ...ready, subject: "   " }), false);
  assert.equal(isSendAllowed({ ...ready, body: "" }), false);
  assert.equal(isSendAllowed({ ...ready, body: "Done by [[DATE]]." }), false);
  assert.equal(isSendAllowed(null), false);
});

test("the auto-save patch carries only changed, non-empty fields", () => {
  const saved = { subject: "Re: Report", body: "Thank you.", includeCc: false };
  assert.deepEqual(buildDraftPatch(saved, saved), {});
  assert.equal(hasDraftPatch(buildDraftPatch(saved, saved)), false);
  assert.deepEqual(
    buildDraftPatch({ subject: "Re: Report", body: "Thank you, done.", includeCc: false }, saved),
    { body: "Thank you, done." },
  );
  assert.deepEqual(
    buildDraftPatch({ subject: "Re: Report", body: "Thank you.", includeCc: true }, saved),
    { includeCc: true },
  );
  assert.deepEqual(
    buildDraftPatch({ subject: "Re: Report", body: "", includeCc: false }, saved),
    {},
  );
  assert.deepEqual(
    buildDraftPatch({ subject: "  ", body: "   ", includeCc: "yes" }, saved),
    {},
  );
  assert.deepEqual(
    buildDraftPatch({ subject: "Re: Report v2", body: "New text.", includeCc: true }, saved),
    { subject: "Re: Report v2", body: "New text.", includeCc: true },
  );
});

test("calendar refusals map to plain keys, never to the Google message", () => {
  const withCode = (code, status = 400) => ({ response: { status, data: { code } } });
  assert.equal(errorMessageKey(withCode("CALENDAR_NOT_CONNECTED", 409)), "errors.calendarNotConnected");
  assert.equal(errorMessageKey(withCode("CALENDAR_SCOPE_REQUIRED", 403)), "errors.calendarScope");
  assert.equal(errorMessageKey(withCode("CALENDAR_REAUTH_REQUIRED", 401)), "errors.calendarReauth");
  assert.equal(errorMessageKey(withCode("CALENDAR_DISABLED", 403)), "errors.calendarDisabled");
  assert.equal(errorMessageKey(withCode("CALENDAR_EVENT_CHANGED", 409)), "errors.calendarEventChanged");
  assert.equal(errorMessageKey(withCode("CALENDAR_RATE_LIMITED", 429)), "errors.rateLimited");
});

test("a stored failure reason is always one of the plain ones", () => {
  assert.equal(calendarFailureKey("notConnected"), "calendar.reasons.notConnected");
  assert.equal(calendarFailureKey("scopeMissing"), "calendar.reasons.scopeMissing");
  assert.equal(calendarFailureKey("apiNotEnabled"), "calendar.reasons.apiNotEnabled");
  assert.equal(calendarFailureKey("rate limit exceeded"), "calendar.reasons.other");
  assert.equal(calendarFailureKey(""), "calendar.reasons.other");
});

test("the connect banner shows only while Calendar is allowed and not on yet", () => {
  assert.equal(showCalendarBanner({ platformEnabled: true, connected: false }), true);
  assert.equal(showCalendarBanner({ platformEnabled: true, connected: true, syncOn: false }), true);
  assert.equal(showCalendarBanner({ platformEnabled: true, connected: true, syncOn: true }), false);
  assert.equal(showCalendarBanner({ platformEnabled: false, connected: false }), false);
  assert.equal(showCalendarBanner({}), false);
});

test("a row reaches the calendar only when it is allowed, connected and on", () => {
  assert.equal(isCalendarUsable({ platformEnabled: true, connected: true }), true);
  assert.equal(isCalendarUsable({ platformEnabled: true, connected: true, syncOn: false }), false);
  assert.equal(isCalendarUsable({ platformEnabled: true, connected: false }), false);
  assert.equal(isCalendarUsable({ platformEnabled: false, connected: true }), false);
  assert.equal(isCalendarSynced({ calendar: { status: "synced" } }), true);
  assert.equal(isCalendarSynced({ calendar: { status: "failed" } }), false);
});

test("the Events tab counts proposals plus the events still ahead", () => {
  const now = new Date(2026, 10, 5, 12, 0);
  const events = [
    { state: "proposed", startAt: new Date(2026, 10, 1).toISOString() },
    { state: "confirmed", startAt: new Date(2026, 10, 1).toISOString() },
    { state: "confirmed", startAt: new Date(2026, 10, 5, 9).toISOString() },
    { state: "confirmed", startAt: new Date(2026, 10, 20).toISOString() },
    { state: "dismissed", startAt: new Date(2026, 10, 20).toISOString() },
  ];
  assert.equal(eventsTabCount(events, now), 3);
  assert.equal(eventsTabCount([], now), 0);
  assert.equal(eventsTabCount(null, now), 0);
});

test("the meeting length stays inside 15 to 240 minutes", () => {
  assert.equal(clampMeetingLength(60), 60);
  assert.equal(clampMeetingLength(5), 15);
  assert.equal(clampMeetingLength(900), 240);
  assert.equal(clampMeetingLength(""), 15);
  assert.equal(clampMeetingLength("abc"), 15);
});

test("the clock inputs round-trip a stored instant", () => {
  const at = instantFromLocalInput({ date: "2026-11-12", time: "09:05" });
  assert.equal(localDateInputValue(at), "2026-11-12");
  assert.equal(localTimeInputValue(at), "09:05");
  assert.equal(localDateTimeInputValue(at), "2026-11-12T09:05");
  assert.equal(localTimeInputValue(""), "");
});

test("an event window keeps the local time the teacher typed", () => {
  const span = eventWindowFromInput({ date: "2026-11-12", startTime: "10:00", endTime: "11:30" });
  assert.equal(span.startAt, instantFromLocalInput({ date: "2026-11-12", time: "10:00" }));
  assert.equal(span.endAt, instantFromLocalInput({ date: "2026-11-12", time: "11:30" }));
});

test("an all-day event and a missing end both leave the end to the server", () => {
  assert.deepEqual(
    eventWindowFromInput({ date: "2026-11-12", allDay: true, startTime: "10:00", endTime: "11:00" }),
    { startAt: instantFromLocalInput({ date: "2026-11-12" }), endAt: null },
  );
  assert.deepEqual(eventWindowFromInput({ date: "2026-11-12", startTime: "10:00" }), {
    startAt: instantFromLocalInput({ date: "2026-11-12", time: "10:00" }),
    endAt: null,
  });
});

test("a window that ends before it starts, or has no date, is refused", () => {
  assert.equal(
    eventWindowFromInput({ date: "2026-11-12", startTime: "12:00", endTime: "11:00" }),
    null,
  );
  assert.equal(
    eventWindowFromInput({ date: "2026-11-12", startTime: "11:00", endTime: "11:00" }),
    null,
  );
  assert.equal(eventWindowFromInput({ startTime: "11:00", endTime: "12:00" }), null);
});

test("the chips say what needs a click first, then what happened", () => {
  assert.deepEqual(calendarChips({}), []);
  assert.deepEqual(calendarChips({ calendar: { status: "synced", htmlLink: "https://cal" } }), [
    { key: "calendar.chips.added", tone: "is-added", link: "https://cal" },
  ]);
  assert.deepEqual(calendarChips({ calendar: { status: "synced", autoAdded: true } }), [
    { key: "calendar.chips.autoAdded", tone: "is-auto", link: "" },
  ]);
  assert.deepEqual(calendarChips({ autoAddWaiting: true }), [
    { key: "calendar.chips.waiting", tone: "is-waiting" },
  ]);
  assert.deepEqual(calendarChips({ calendar: { status: "synced" }, autoAddWaiting: true }), [
    { key: "calendar.chips.added", tone: "is-added", link: "" },
  ]);
});

test("a failure carries the plain reason and a pending change comes first", () => {
  const chips = calendarChips({
    calendar: { status: "failed", lastError: "rateLimited", givenUp: true, htmlLink: "https://cal" },
    pendingChange: { kind: "move" },
    overlaps: [{ title: "Staff meeting" }],
  });
  assert.deepEqual(chips.map((chip) => chip.key), [
    "calendar.chips.dateChanged",
    "calendar.chips.gaveUp",
    "calendar.chips.overlap",
  ]);
  assert.equal(chips[1].reasonKey, "calendar.reasons.rateLimited");
  assert.equal(chips[1].link, "https://cal");
  assert.equal(chips[2].title, "Staff meeting");
});

test("a cancelled item and a lost link each get their own words", () => {
  assert.deepEqual(calendarChips({ pendingChange: { kind: "cancel" } }), [
    { key: "calendar.chips.cancelled", tone: "is-change" },
  ]);
  assert.deepEqual(calendarChips({ calendar: { status: "lost" } }), [
    { key: "calendar.chips.lost", tone: "is-lost" },
  ]);
});

test("an overlap without a title is not worth a chip", () => {
  assert.deepEqual(calendarChips({ overlaps: [] }), []);
  assert.deepEqual(calendarChips({ overlaps: [{}] }), []);
  assert.deepEqual(calendarChips({ overlaps: null }), []);
});
