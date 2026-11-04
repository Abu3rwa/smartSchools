import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";

import InboxAssistantSettings from "../models/InboxAssistantSettings.js";
import InboxDeadline from "../models/InboxDeadline.js";
import InboxEmail from "../models/InboxEmail.js";
import InboxReplyDraft from "../models/InboxReplyDraft.js";
import InboxScanRun from "../models/InboxScanRun.js";

const ids = () => ({
  school: new mongoose.Types.ObjectId(),
  user: new mongoose.Types.ObjectId(),
});

const emailDoc = (overrides = {}) =>
  new InboxEmail({
    ...ids(),
    gmailMessageId: "gmail-1",
    threadId: "thread-1",
    receivedAt: new Date("2026-11-01T09:00:00Z"),
    priority: "fyi",
    ...overrides,
  });

const deadlineDoc = (overrides = {}) =>
  new InboxDeadline({
    ...ids(),
    email: new mongoose.Types.ObjectId(),
    title: "Return the forms",
    dueAt: new Date("2026-11-05T12:00:00Z"),
    source: "ai",
    ...overrides,
  });

const draftDoc = (overrides = {}) =>
  new InboxReplyDraft({
    ...ids(),
    email: new mongoose.Types.ObjectId(),
    ...overrides,
  });

const scanDoc = (overrides = {}) =>
  new InboxScanRun({ ...ids(), mode: "refresh", ...overrides });

test("all five models timestamp their rows", () => {
  for (const model of [
    InboxAssistantSettings,
    InboxEmail,
    InboxDeadline,
    InboxReplyDraft,
    InboxScanRun,
  ]) {
    assert.equal(model.schema.get("timestamps"), true);
  }
});

test("an inbox email needs its school, owner and Gmail identity", () => {
  const errors = new InboxEmail({}).validateSync().errors;
  for (const field of ["school", "user", "gmailMessageId", "threadId", "receivedAt", "priority"]) {
    assert.equal(errors[field]?.kind, "required", `${field} should be required`);
  }

  assert.equal(emailDoc().validateSync(), undefined);
});

test("a stored email opens by default and keeps its summary limits", () => {
  const email = emailDoc({ subject: "x".repeat(301), summary: "y".repeat(301), reason: "z".repeat(201) });
  const errors = email.validateSync().errors;
  assert.equal(errors.subject.kind, "maxlength");
  assert.equal(errors.summary.kind, "maxlength");
  assert.equal(errors.reason.kind, "maxlength");

  const fresh = emailDoc();
  assert.equal(fresh.status, "open");
  assert.equal(fresh.language, "other");
  assert.equal(fresh.bodyPurgedAt, null);
  assert.equal(fresh.repliedDetectedAt, null);
  assert.deepEqual(fresh.ccEmails, []);
  assert.deepEqual(fresh.toEmails, []);
});

test("email priority, status and language only accept the listed strings", () => {
  assert.equal(emailDoc({ priority: "high" }).validateSync().errors.priority.kind, "enum");
  assert.equal(emailDoc({ status: "closed" }).validateSync().errors.status.kind, "enum");
  assert.equal(emailDoc({ language: "fr" }).validateSync().errors.language.kind, "enum");
  assert.equal(emailDoc({ classifiedBy: "guess" }).validateSync().errors.classifiedBy.kind, "enum");
});

test("a deadline starts proposed and only accepts the listed states", () => {
  const deadline = deadlineDoc();
  assert.equal(deadline.state, "proposed");
  assert.equal(deadline.dueDateOnly, true);

  assert.equal(deadlineDoc({ state: "open" }).validateSync().errors.state.kind, "enum");
  assert.equal(deadlineDoc({ source: "system" }).validateSync().errors.source.kind, "enum");

  const missing = new InboxDeadline({}).validateSync().errors;
  for (const field of ["school", "user", "email", "title", "dueAt", "source"]) {
    assert.equal(missing[field]?.kind, "required", `${field} should be required`);
  }
});

test("a reply draft starts as a draft and only accepts the listed states", () => {
  const draft = draftDoc();
  assert.equal(draft.status, "draft");
  assert.equal(draft.tone, "professional");
  assert.equal(draft.gmailDraftId, null);
  assert.equal(draft.sentAt, null);

  assert.equal(draftDoc({ status: "pending" }).validateSync().errors.status.kind, "enum");
  assert.equal(draftDoc({ tone: "loud" }).validateSync().errors.tone.kind, "enum");
  assert.equal(draftDoc({ language: "fr" }).validateSync().errors.language.kind, "enum");
  assert.equal(draftDoc({ body: "x".repeat(8001) }).validateSync().errors.body.kind, "maxlength");
});

test("a scan run starts running and counts from zero", () => {
  const scan = scanDoc();
  assert.equal(scan.status, "running");
  assert.equal(scan.listedCount, 0);
  assert.equal(scan.charged, false);
  assert.equal(scan.finishedAt, null);

  assert.equal(scanDoc({ mode: "quick" }).validateSync().errors.mode.kind, "enum");
  assert.equal(scanDoc({ status: "done" }).validateSync().errors.status.kind, "enum");
});

test("teacher settings default to not opted in, professional and a two-day nudge", () => {
  const settings = new InboxAssistantSettings(ids());
  assert.equal(settings.validateSync(), undefined);
  assert.equal(settings.optedIn, false);
  assert.equal(settings.scanSize, 25);
  assert.equal(settings.tone, "professional");
  assert.equal(settings.nudgeAfterDays, 2);
  assert.equal(settings.includeCcByDefault, false);
  assert.deepEqual(settings.customReplyTypes, []);

  assert.equal(
    new InboxAssistantSettings({ ...ids(), nudgeAfterDays: 0 }).validateSync().errors.nudgeAfterDays.kind,
    "min",
  );
  assert.equal(
    new InboxAssistantSettings({ ...ids(), nudgeAfterDays: 15 }).validateSync().errors.nudgeAfterDays.kind,
    "max",
  );
  assert.equal(
    new InboxAssistantSettings({ ...ids(), tone: "loud" }).validateSync().errors.tone.kind,
    "enum",
  );
});

test("a teacher can save at most twenty reply types of their own", () => {
  const types = (count) =>
    Array.from({ length: count }, (_, index) => ({
      id: `mine-${index}`,
      label: `Type ${index}`,
      instruction: "Answer with this text.",
    }));

  assert.equal(new InboxAssistantSettings({ ...ids(), customReplyTypes: types(20) }).validateSync(), undefined);
  const errors = new InboxAssistantSettings({ ...ids(), customReplyTypes: types(21) }).validateSync().errors;
  assert.ok(errors.customReplyTypes, "the 21st type should be rejected");
});

test("the unique indexes guard one settings row per teacher and one row per Gmail message", () => {
  const settingsIndex = InboxAssistantSettings.schema
    .indexes()
    .find(([fields]) => fields.school === 1 && fields.user === 1);
  assert.equal(settingsIndex?.[1]?.unique, true);

  const emailIndex = InboxEmail.schema
    .indexes()
    .find(([fields]) => fields.user === 1 && fields.gmailMessageId === 1);
  assert.equal(emailIndex?.[1]?.unique, true);
});
