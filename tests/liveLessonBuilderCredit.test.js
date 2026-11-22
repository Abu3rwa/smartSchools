import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import AiBuilderOperation from "../models/AiBuilderOperation.js";
import AiCreditAccount from "../models/AiCreditAccount.js";
import AiCreditEntry from "../models/AiCreditEntry.js";
import AiCreditSetting from "../models/AiCreditSetting.js";
import LiveLessonDraft from "../models/LiveLessonDraft.js";
import { chargeUsage, holdCredit } from "../services/aiCreditService.js";
import {
  accumulateOperationTokens,
  admitOperationCredit,
  settleOperationCredit,
} from "../services/liveLessonBuilderOperationService.js";
import { releaseStaleBuilderHolds } from "../jobs/builderCreditHoldJob.js";

const schoolId = new mongoose.Types.ObjectId();
const ownerId = new mongoose.Types.ObjectId();
const draftId = new mongoose.Types.ObjectId();
const session = { testSession: true };

const query = (value) => {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    session: () => chain,
    lean: async () => value,
  };
  return chain;
};

const draft = () => ({ _id: draftId, school: schoolId, ownerId });
const runningOp = (over = {}) => ({
  _id: "66bb00000000000000000001",
  school: schoolId,
  ownerId,
  draftId,
  opKey: "gen:op-1",
  status: "running",
  holdCents: 0,
  quotedCents: 0,
  tokens: { input: 0, cachedInput: 0, output: 0, total: 0 },
  model: "gpt-5.4-mini",
  ...over,
});

test.beforeEach((context) => {
  context.mock.method(mongoose.connection, "transaction", async (callback) => callback(session));
});

test("a hold reserves only free credit, never the part another step holds", async (context) => {
  let filter = null;
  let update = null;
  context.mock.method(AiCreditAccount, "findOneAndUpdate", (filterValue, updateValue) => {
    filter = filterValue;
    update = updateValue;
    return query({ balanceCents: 100, heldCents: 40 });
  });

  const result = await holdCredit({ schoolId, userId: ownerId, cents: 40 });

  assert.equal(result.ok, true);
  assert.equal(result.availableCents, 60);
  assert.deepEqual(update.$inc, { heldCents: 40 });
  assert.deepEqual(filter.paused, { $ne: true });
  assert.equal(Number(filter.school), Number(schoolId));
  assert.ok(filter.$expr, "the check and the reservation are one guarded write");
});

test("an uncovered hold reports the free balance instead of reserving", async (context) => {
  context.mock.method(AiCreditAccount, "findOneAndUpdate", () => query(null));
  context.mock.method(AiCreditAccount, "findOne", () => query({ balanceCents: 10, heldCents: 8 }));

  const result = await holdCredit({ schoolId, userId: ownerId, cents: 5 });

  assert.equal(result.ok, false);
  assert.equal(result.availableCents, 2);
  assert.equal(result.heldCents, 0);
});

test("a paused account cannot reserve credit", async (context) => {
  context.mock.method(AiCreditAccount, "findOneAndUpdate", () => query(null));
  context.mock.method(AiCreditAccount, "findOne", () => query({ balanceCents: 100, heldCents: 0, paused: true }));

  await assert.rejects(
    holdCredit({ schoolId, userId: ownerId, cents: 5 }),
    (error) => error.statusCode === 402 && error.code === "AI_CREDIT_PAUSED",
  );
});

test("admission holds the estimate and records it on the operation", async (context) => {
  context.mock.method(AiCreditAccount, "findOneAndUpdate", () => query({ balanceCents: 500, heldCents: 0 }));
  let recorded = null;
  context.mock.method(AiBuilderOperation, "updateOne", async (filter, update) => {
    recorded = { filter, update };
    return { modifiedCount: 1 };
  });

  const result = await admitOperationCredit({
    draft: draft(),
    op: runningOp(),
    quotedCents: 12.5,
  });

  assert.deepEqual(result, { heldCents: 12.5 });
  assert.equal(recorded.filter.holdCents, 0);
  assert.equal(recorded.update.$set.quotedCents, 12.5);
  assert.ok(recorded.update.$set.quotedAt instanceof Date);
  assert.equal(recorded.update.$set.holdCents, 12.5);
});

test("a step the balance cannot cover never starts", async (context) => {
  context.mock.method(AiCreditAccount, "findOneAndUpdate", () => query(null));
  context.mock.method(AiCreditAccount, "findOne", () => query({ balanceCents: 10, heldCents: 0 }));
  const written = context.mock.method(AiBuilderOperation, "updateOne", async () => ({ modifiedCount: 1 }));

  await assert.rejects(
    admitOperationCredit({ draft: draft(), op: runningOp(), quotedCents: 25 }),
    (error) => error.statusCode === 402
      && error.code === "AI_CREDIT_REQUIRED"
      && /25 credits/.test(error.message)
      && /10/.test(error.message),
  );
  assert.equal(written.mock.callCount(), 0, "nothing is recorded for an unaffordable step");
});

test("a resumed operation reuses the admission it already paid for", async (context) => {
  const accountWrite = context.mock.method(AiCreditAccount, "findOneAndUpdate", () => query(null));

  const result = await admitOperationCredit({
    draft: draft(),
    op: runningOp({ holdCents: 7 }),
    quotedCents: 20,
  });

  assert.deepEqual(result, { heldCents: 7 });
  assert.equal(accountWrite.mock.callCount(), 0);
});

test("each provider reply adds its tokens to the operation", async (context) => {
  let update = null;
  context.mock.method(AiBuilderOperation, "updateOne", async (filter, value) => {
    update = value;
    return { modifiedCount: 1 };
  });

  await accumulateOperationTokens({
    ownerId,
    opKey: "gen:op-1",
    reply: {
      inputtokenCount: 100,
      cachedInputtokenCount: 20,
      outputtokenCount: 50,
      totalTokenCount: 150,
    },
  });

  assert.deepEqual(update.$inc, {
    "tokens.input": 100,
    "tokens.cachedInput": 20,
    "tokens.output": 50,
    "tokens.total": 150,
  });
});

const stubsForSettlement = (context) => {
  const calls = { charge: null, entry: null, final: null, releases: [] };
  context.mock.method(AiCreditSetting, "findOne", () => query({ markupPercent: 25 }));
  context.mock.method(AiCreditAccount, "findOneAndUpdate", (filter, update) => {
    calls.charge = { filter, update };
    return query({ _id: "account", balanceCents: 400, schoolCents: 400, lowBalanceCents: 1, alerts: {} });
  });
  context.mock.method(AiCreditAccount, "updateOne", async (filter, update) => {
    if (update.$inc?.heldCents) calls.releases.push(update);
    return { modifiedCount: 0 };
  });
  context.mock.method(AiCreditEntry, "create", async (rows) => {
    calls.entry = rows[0];
    return [{ ...rows[0], _id: "entry-1" }];
  });
  context.mock.method(AiBuilderOperation, "updateOne", async (filter, update) => {
    calls.final = update;
    return { modifiedCount: 1 };
  });
  return calls;
};

test("settlement charges the used tokens once, capped at the approved estimate", async (context) => {
  const calls = stubsForSettlement(context);
  context.mock.method(AiBuilderOperation, "findOneAndUpdate", () => query(runningOp({
    status: "succeeded",
    holdCents: 100,
    quotedCents: 20,
    tokens: { input: 100000, cachedInput: 0, output: 100000, total: 200000 },
  })));

  const settled = await settleOperationCredit({ draftId, opKey: "gen:op-1" });

  assert.deepEqual(settled, { charged: true, chargedCents: 20, entryId: "entry-1" });
  // Provider cost here is ~52.5c, sold at 25% markup (~65.6c); the approved
  // estimate caps it at 20c and the platform absorbs the rest.
  assert.equal(calls.entry.chargedCents, 20);
  assert.equal(calls.entry.amountCents, -20);
  assert.equal(calls.charge.update.$inc.heldCents, -100);
  assert.equal(calls.charge.update.$inc.balanceCents, -20);
  assert.equal(calls.final.$set.holdCents, 0);
  assert.equal(calls.final.$set.settledCents, 20);
  assert.deepEqual(calls.final.$set.creditEntryIds, ["entry-1"]);
});

test("settlement below the estimate releases the unused hold", async (context) => {
  const calls = stubsForSettlement(context);
  context.mock.method(AiBuilderOperation, "findOneAndUpdate", () => query(runningOp({
    status: "succeeded",
    holdCents: 1000,
    quotedCents: 1000,
    tokens: { input: 1000, cachedInput: 0, output: 100, total: 1100 },
  })));

  const settled = await settleOperationCredit({ draftId, opKey: "gen:op-1" });

  assert.equal(settled.chargedCents, 0.15);
  assert.equal(calls.charge.update.$inc.heldCents, -1000);
  assert.equal(calls.charge.update.$inc.balanceCents, -0.15);
  assert.equal(calls.final.$set.settledCents, 0.15);
});

test("an operation with no recorded tokens only releases its hold", async (context) => {
  context.mock.method(AiBuilderOperation, "findOneAndUpdate", () => query(runningOp({
    status: "failed",
    holdCents: 30,
    quotedCents: 30,
  })));
  const charge = context.mock.method(AiCreditEntry, "create", async () => {
    throw new Error("must not charge");
  });
  const release = context.mock.method(AiCreditAccount, "updateOne", async () => ({ modifiedCount: 1 }));
  let final = null;
  context.mock.method(AiBuilderOperation, "updateOne", async (filter, update) => {
    final = update;
    return { modifiedCount: 1 };
  });

  const settled = await settleOperationCredit({ draftId, opKey: "gen:op-1" });

  assert.equal(settled.charged, false);
  assert.equal(charge.mock.callCount(), 0);
  assert.equal(release.mock.calls[0].arguments[1].$inc.heldCents, -30);
  assert.equal(final.$set.holdCents, 0);
});

test("settling twice charges once", async (context) => {
  context.mock.method(AiBuilderOperation, "findOneAndUpdate", () => query(null));
  const charged = context.mock.method(AiCreditEntry, "create", async () => {
    throw new Error("must not charge");
  });

  assert.equal(await settleOperationCredit({ draftId, opKey: "gen:op-1" }), null);
  assert.equal(charged.mock.callCount(), 0);
});

test("a charge that releases a hold cannot spend another step's reservation", async (context) => {
  let filter = null;
  let update = null;
  context.mock.method(AiCreditSetting, "findOne", () => query({ markupPercent: 25 }));
  context.mock.method(AiCreditAccount, "findOneAndUpdate", (filterValue, updateValue) => {
    filter = filterValue;
    update = updateValue;
    return query({ balanceCents: 450, schoolCents: 400, lowBalanceCents: 1, alerts: {} });
  });
  context.mock.method(AiCreditAccount, "updateOne", async () => ({ modifiedCount: 0 }));
  context.mock.method(AiCreditEntry, "create", async (rows) => [{ ...rows[0], _id: "entry-1" }]);

  const result = await chargeUsage({
    schoolId,
    userId: ownerId,
    reply: { inputtokenCount: 1000, outputtokenCount: 100, totalTokenCount: 1100, modelName: "gpt-5.4-mini" },
    feature: "live_lesson_builder",
    rates: { model: "gpt-5.4-mini", inputPerMillionCents: 75, cachedInputPerMillionCents: 7.5, outputPerMillionCents: 450 },
    chargedCents: 0.15,
    holdCents: 20,
  });

  assert.equal(result.charged, true);
  assert.ok(filter.$expr, "the free balance, not the raw balance, is checked");
  assert.equal(update.$inc.heldCents, -20);
  assert.equal(update.$inc.balanceCents, -0.15);
});

test("the sweeper expires a dead running operation and releases its hold", async (context) => {
  const op = runningOp({ holdCents: 30, lockExpiresAt: new Date(Date.now() - 60000) });
  context.mock.method(AiBuilderOperation, "find", () => query([op]));
  let expired = null;
  let claimed = null;
  context.mock.method(AiBuilderOperation, "findOneAndUpdate", (filter, update) => {
    if (update.$set?.status === "expired") {
      expired = { filter, update };
      return query({ ...op, status: "expired" });
    }
    claimed = { filter, update };
    return query({ ...op, status: "expired" });
  });
  const draftClear = context.mock.method(LiveLessonDraft, "updateOne", async () => ({ modifiedCount: 1 }));
  const release = context.mock.method(AiCreditAccount, "updateOne", async () => ({ modifiedCount: 1 }));
  context.mock.method(AiBuilderOperation, "updateOne", async () => ({ modifiedCount: 1 }));

  const summary = await releaseStaleBuilderHolds({ now: new Date() });

  assert.equal(summary.scanned, 1);
  assert.equal(summary.released, 1);
  assert.equal(expired.filter.status, "running");
  assert.ok(claimed.update.$set.settledAt instanceof Date);
  assert.equal(Number(draftClear.mock.calls[0].arguments[0]._id), Number(draftId));
  assert.equal(release.mock.calls[0].arguments[1].$inc.heldCents, -30);
});
