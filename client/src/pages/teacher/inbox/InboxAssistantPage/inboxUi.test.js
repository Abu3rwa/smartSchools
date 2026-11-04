import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDraftPatch,
  clampScanSize,
  errorMessageKey,
  estimateNotice,
  extractPlaceholders,
  formatEstimate,
  groupForEmail,
  groupInboxEmails,
  hasDraftPatch,
  isSendAllowed,
  priorityKey,
  senderRoleKey,
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
