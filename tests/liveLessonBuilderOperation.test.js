import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import AiBuilderOperation from "../models/AiBuilderOperation.js";
import LiveLessonDraft from "../models/LiveLessonDraft.js";
import AiCreditEntry from "../models/AiCreditEntry.js";
import AiCreditSetting from "../models/AiCreditSetting.js";
import {
  beginOperation,
  builderError,
  builderUsage,
  hashPayload,
  normalizeOpKey,
  operationWasCharged,
  requireVersion,
} from "../services/liveLessonBuilderOperationService.js";
import { quoteForSetup } from "../services/liveLessonBuilderQuoteService.js";
import { LIVE_LESSON_BUILDER } from "../config/liveLessonBuilderConfig.js";

const schoolId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();
const draftId = new mongoose.Types.ObjectId();

const chain = (value) => {
  const query = {
    select: () => query,
    lean: async () => value,
  };
  return query;
};

const draft = () => ({
  _id: draftId,
  school: schoolId,
  ownerId,
  version: 4,
  activeOp: null,
});

test("operation keys must be unique-looking tokens", () => {
  assert.equal(normalizeOpKey("  plan:abc-123  "), "plan:abc-123");
  assert.throws(() => normalizeOpKey("short"), (error) => error.code === "VALIDATION");
  assert.throws(() => normalizeOpKey("has spaces in it"), (error) => error.code === "VALIDATION");
  assert.throws(() => normalizeOpKey(""), (error) => error.code === "VALIDATION");
});

test("payload hashing is stable and content-sensitive", () => {
  assert.equal(hashPayload({ a: 1, b: [2] }), hashPayload({ a: 1, b: [2] }));
  assert.notEqual(hashPayload({ a: 1 }), hashPayload({ a: 2 }));
  assert.equal(hashPayload("raw"), hashPayload("raw"));
});

test("builder usage is metered under one feature with an operation reference", () => {
  assert.deepEqual(builderUsage({ schoolId, userId: ownerId, opKey: "gen:op-1", billable: false }), {
    schoolId,
    userId: ownerId,
    feature: "live_lesson_builder",
    refs: { operationKey: "gen:op-1" },
    billable: false,
  });
});

test("version checks accept a missing header and reject a stale one", () => {
  const req = (headers = {}, body = {}) => ({ get: (name) => headers[name.toLowerCase()], body });
  assert.doesNotThrow(() => requireVersion(req(), draft()));
  assert.doesNotThrow(() => requireVersion(req({ "if-match": "\"4\"" }), draft()));
  assert.doesNotThrow(() => requireVersion(req({}, { version: 4 }), draft()));
  assert.throws(
    () => requireVersion(req({ "if-match": "3" }), draft()),
    (error) => error.statusCode === 409 && error.code === "VERSION_CONFLICT",
  );
  assert.throws(
    () => requireVersion(req({}, { version: "not-a-number" }), draft()),
    (error) => error.code === "VERSION_CONFLICT",
  );
});

test("a stored charged ledger row means this operation was already billed", async (t) => {
  let filter;
  t.mock.method(AiCreditEntry, "exists", async (value) => {
    filter = value;
    return { _id: "entry" };
  });
  assert.equal(await operationWasCharged({ schoolId, opKey: "gen:op-1" }), true);
  assert.equal(filter.charged, true);
  assert.equal(filter.operationKey, "gen:op-1");

  t.mock.method(AiCreditEntry, "exists", async () => null);
  assert.equal(await operationWasCharged({ schoolId, opKey: "gen:op-2" }), false);
});

test("replaying a finished operation returns its outcome without a new run", async (t) => {
  const stored = { _id: "op", opKey: "plan:op-1", status: "succeeded", payloadHash: hashPayload({ a: 1 }) };
  t.mock.method(AiBuilderOperation, "findOne", () => chain(stored));
  const created = t.mock.method(AiBuilderOperation, "create", async () => {
    throw new Error("must not create");
  });

  const result = await beginOperation({
    draft: draft(),
    type: "plan",
    opKey: "plan:op-1",
    payloadHash: hashPayload({ a: 1 }),
    version: 4,
  });
  assert.equal(result.replay, true);
  assert.equal(result.op.status, "succeeded");
  assert.equal(created.mock.callCount(), 0);
});

test("reusing an operation key for different input is refused", async (t) => {
  t.mock.method(AiBuilderOperation, "findOne", () => chain({
    _id: "op",
    opKey: "plan:op-1",
    status: "succeeded",
    payloadHash: hashPayload({ a: 1 }),
  }));
  await assert.rejects(
    beginOperation({
      draft: draft(),
      type: "plan",
      opKey: "plan:op-1",
      payloadHash: hashPayload({ a: 2 }),
      version: 4,
    }),
    (error) => error.statusCode === 422 && error.code === "IDEMPOTENCY_KEY_REUSED",
  );
});

test("a running operation with a live lock blocks a second step", async (t) => {
  t.mock.method(AiBuilderOperation, "findOne", () => chain({
    _id: "op",
    opKey: "gen:op-1",
    status: "running",
    lockExpiresAt: new Date(Date.now() + 60000),
  }));
  await assert.rejects(
    beginOperation({ draft: draft(), type: "generate", opKey: "gen:op-1", payloadHash: hashPayload({}), version: 4 }),
    (error) => error.statusCode === 409 && error.code === "OPERATION_IN_PROGRESS",
  );
});

test("the first run creates a running operation and locks the draft", async (t) => {
  t.mock.method(AiBuilderOperation, "findOne", () => chain(null));
  t.mock.method(AiBuilderOperation, "create", async (payload) => ({
    ...payload,
    _id: new mongoose.Types.ObjectId(),
    toObject() {
      return { ...payload, _id: this._id };
    },
  }));
  t.mock.method(AiBuilderOperation, "updateOne", async () => ({}));
  let lockFilter;
  t.mock.method(LiveLessonDraft, "findOneAndUpdate", async (filter, update) => {
    lockFilter = { filter, update };
    return { activeOp: update.$set.activeOp };
  });

  const result = await beginOperation({
    draft: draft(),
    type: "plan",
    opKey: "plan:op-2",
    payloadHash: hashPayload({ a: 1 }),
    version: 4,
  });
  assert.equal(result.replay, false);
  assert.equal(result.op.status, "running");
  assert.equal(lockFilter.filter.activeOp, null);
  assert.equal(lockFilter.filter.ownerId, ownerId);
  assert.equal(lockFilter.update.$set.activeOp.opKey, "plan:op-2");
});

test("a second running operation cannot lock a draft that already has one", async (t) => {
  t.mock.method(AiBuilderOperation, "findOne", () => chain(null));
  t.mock.method(AiBuilderOperation, "create", async (payload) => ({
    ...payload,
    _id: new mongoose.Types.ObjectId(),
    toObject: () => payload,
  }));
  const marked = t.mock.method(AiBuilderOperation, "updateOne", async () => ({}));
  t.mock.method(LiveLessonDraft, "findOneAndUpdate", async () => null);

  await assert.rejects(
    beginOperation({ draft: draft(), type: "generate", opKey: "gen:op-9", payloadHash: hashPayload({}), version: 4 }),
    (error) => error.statusCode === 409 && error.code === "OPERATION_IN_PROGRESS",
  );
  assert.equal(marked.mock.callCount(), 1);
  assert.equal(marked.mock.calls[0].arguments[1].$set.status, "failed");
});

test("quote validation refuses counts the builder cannot build", async () => {
  await assert.rejects(
    quoteForSetup({ slideCount: 0, questionCount: 2, language: "en" }),
    (error) => error.statusCode === 422 && error.code === "VALIDATION",
  );
  await assert.rejects(
    quoteForSetup({ slideCount: 2, questionCount: 51, language: "en" }),
    (error) => error.statusCode === 422,
  );
  await assert.rejects(
    quoteForSetup({ slideCount: 60, questionCount: 0, language: "en" }),
    (error) => error.statusCode === 422,
  );
});

test("an unpriced model blocks the quote instead of guessing", async (t) => {
  const previous = process.env.LIVE_LESSON_BUILDER_MODEL;
  process.env.LIVE_LESSON_BUILDER_MODEL = "unpriced-model";
  try {
    await assert.rejects(
      quoteForSetup({ slideCount: 4, questionCount: 2, language: "en" }),
      (error) => error.statusCode === 422 && error.code === "MODEL_UNPRICED",
    );
  } finally {
    if (previous === undefined) delete process.env.LIVE_LESSON_BUILDER_MODEL;
    else process.env.LIVE_LESSON_BUILDER_MODEL = previous;
  }
  void t;
});

test("a valid setup gets a stable quote key and a marked-up price", async (t) => {
  t.mock.method(AiCreditSetting, "findOne", () => chain({ markupPercent: 25 }));
  const setup = {
    slideCount: 6,
    questionCount: 4,
    language: "en",
    questionKinds: ["mcq"],
    sourceText: "Water moves through the environment.",
  };
  const first = await quoteForSetup(setup);
  const second = await quoteForSetup(setup);
  assert.equal(first.quoteKey, second.quoteKey);
  assert.equal(first.markupPercent, 25);
  assert.ok(first.total.chargedCents > first.total.providerCostCents);
  assert.ok(first.plan.inputTokens > 0);
  assert.equal(first.content.calls, 6 + Math.ceil(4 / LIVE_LESSON_BUILDER.chunkSize));
  assert.equal(first.generationMode, "high");
  assert.ok(first.model);
  assert.ok(first.plan.maxOutputTokens >= first.plan.outputTokens);
});

test("the error helper keeps a status code and a machine code", () => {
  const error = builderError(409, "VERSION_CONFLICT", "Reload.");
  assert.equal(error.statusCode, 409);
  assert.equal(error.code, "VERSION_CONFLICT");
  assert.equal(error.message, "Reload.");
});
