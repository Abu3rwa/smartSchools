import { createHash } from "node:crypto";
import AiBuilderOperation from "../models/AiBuilderOperation.js";
import LiveLessonDraft from "../models/LiveLessonDraft.js";
import AiCreditEntry from "../models/AiCreditEntry.js";
import {
  LIVE_LESSON_BUILDER,
  LIVE_LESSON_BUILDER_FEATURE,
  liveLessonBuilderLockMs,
  liveLessonBuilderModel,
} from "../config/liveLessonBuilderConfig.js";
import { ratesForModel } from "../config/aiPricing.js";
import {
  applyMarkup,
  chargeUsage,
  costCents,
  getMarkupPercent,
  holdCredit,
  releaseCreditHold,
  roundCents,
} from "./aiCreditService.js";

/**
 * Operation lifecycle: one running AI step per teacher, one stored outcome per
 * client key. A retry with the same key reads the stored outcome instead of
 * calling the provider again, which is what keeps a lost response from becoming
 * a second charge.
 */

export const builderError = (statusCode, code, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

export const hashPayload = (value) => createHash("sha256")
  .update(typeof value === "string" ? value : JSON.stringify(value ?? {}))
  .digest("hex");

export const normalizeOpKey = (value) => {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9:_-]{8,80}$/.test(key)) {
    throw builderError(422, "VALIDATION", "Each AI step needs its own operation key.");
  }
  return key;
};

/** A stale lock means the request that held it died. The work is not lost: the
 * targeted items keep their previous status, and the UI offers Resume. Calls
 * already made are settled at the capped estimate and the hold is released. */
export const expireStaleActiveOp = async (draft) => {
  const active = draft?.activeOp;
  if (!active?.opKey || !active.lockExpiresAt) return false;
  if (new Date(active.lockExpiresAt).getTime() >= Date.now()) return false;
  await AiBuilderOperation.updateOne(
    { draftId: draft._id, opKey: active.opKey, status: "running" },
    { $set: { status: "expired", completedAt: new Date() } },
  );
  await settleOperationCredit({ draftId: draft._id, opKey: active.opKey });
  await LiveLessonDraft.updateOne(
    { _id: draft._id, "activeOp.opKey": active.opKey },
    { $set: { activeOp: null } },
  );
  draft.activeOp = null;
  return true;
};

export const requireVersion = (req, draft) => {
  const raw = req.get?.("if-match") ?? req.body?.version;
  if (raw === undefined || raw === null || raw === "") return;
  const version = Number(String(raw).replace(/"/g, ""));
  if (!Number.isInteger(version) || version !== Number(draft.version)) {
    throw builderError(409, "VERSION_CONFLICT", "This draft changed in another tab. Reload before saving.");
  }
};

export const assertNoActiveOp = (draft) => {
  const active = draft?.activeOp;
  if (active?.opKey) {
    throw builderError(
      409,
      "OPERATION_IN_PROGRESS",
      "Another AI step is still running for this draft. Wait for it to finish or stop after the current step.",
    );
  }
};

const isTerminal = (status) => ["succeeded", "partial", "failed", "expired", "cancelled"].includes(status);

/**
 * Find or create the operation for this key. Returns `{ op, replay }`; a replay
 * is a stored outcome and must not call the provider or charge again.
 */
export const beginOperation = async ({
  draft,
  type,
  opKey,
  payloadHash,
  itemIds = [],
  version,
}) => {
  const key = normalizeOpKey(opKey);
  const existing = await AiBuilderOperation.findOne({ draftId: draft._id, opKey: key }).lean();
  if (existing) {
    if (existing.payloadHash && payloadHash && existing.payloadHash !== payloadHash) {
      throw builderError(422, "IDEMPOTENCY_KEY_REUSED", "This operation key was already used for a different change.");
    }
    if (isTerminal(existing.status)) return { op: existing, replay: true };
    if (existing.status === "running") {
      const locked = existing.lockExpiresAt && new Date(existing.lockExpiresAt).getTime() >= Date.now();
      if (locked) {
        throw builderError(409, "OPERATION_IN_PROGRESS", "This AI step is still running. Wait for its result.");
      }
      const taken = await AiBuilderOperation.findOneAndUpdate(
        { _id: existing._id, status: "running" },
        {
          $set: {
            attempt: Number(existing.attempt || 1) + 1,
            lockExpiresAt: new Date(Date.now() + liveLessonBuilderLockMs()),
            completedAt: null,
          },
        },
        { new: true },
      ).lean();
      if (!taken) {
        throw builderError(409, "OPERATION_IN_PROGRESS", "This AI step is still running. Wait for its result.");
      }
      await LiveLessonDraft.updateOne(
        { _id: draft._id, "activeOp.opKey": key },
        { $set: { activeOp: null } },
      );
      await setActiveOp(draft, { opKey: key, type, itemIds });
      return { op: taken, replay: false, takeover: true };
    }
  }

  let op;
  try {
    op = await AiBuilderOperation.create({
      school: draft.school,
      ownerId: draft.ownerId,
      draftId: draft._id,
      opKey: key,
      type,
      payloadHash,
      baseVersion: Number(version ?? draft.version) || 0,
      itemIds,
      status: "running",
      model: liveLessonBuilderModel(),
      lockExpiresAt: new Date(Date.now() + liveLessonBuilderLockMs()),
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw builderError(
        409,
        "OPERATION_IN_PROGRESS",
        "Another AI step is already running. Finish or stop it before starting a new one.",
      );
    }
    throw error;
  }

  await setActiveOp(draft, { opKey: key, type, itemIds });
  return { op: op.toObject(), replay: false };
};

const setActiveOp = async (draft, { opKey, type, itemIds }) => {
  const updated = await LiveLessonDraft.findOneAndUpdate(
    { _id: draft._id, school: draft.school, ownerId: draft.ownerId, activeOp: null },
    {
      $set: {
        activeOp: {
          opKey,
          type,
          itemIds,
          startedAt: new Date(),
          lockExpiresAt: new Date(Date.now() + liveLessonBuilderLockMs()),
          cancelRequested: false,
        },
      },
    },
    { new: true },
  );
  if (!updated) {
    await AiBuilderOperation.updateOne(
      { draftId: draft._id, opKey, status: "running" },
      { $set: { status: "failed", errorCode: "OPERATION_IN_PROGRESS", completedAt: new Date() } },
    );
    throw builderError(409, "OPERATION_IN_PROGRESS", "Another AI step is already running for this draft.");
  }
  draft.activeOp = updated.activeOp;
};

export const finishOperation = async ({
  draftId,
  opKey,
  status,
  errorCode = "",
  itemFailures = [],
}) => {
  await AiBuilderOperation.updateOne(
    { draftId, opKey },
    {
      $set: {
        status,
        completedAt: new Date(),
        errorCode,
        itemFailures,
      },
    },
  );
  await LiveLessonDraft.updateOne(
    { _id: draftId, "activeOp.opKey": opKey },
    { $set: { activeOp: null } },
  );
};

/**
 * Every provider call in an operation adds its tokens here, so a request that
 * dies mid-run still has enough recorded to settle the calls it already made.
 */
export const accumulateOperationTokens = async ({ ownerId, opKey, reply = {} }) => {
  const input = Number(reply.inputtokenCount) || 0;
  const cachedInput = Number(reply.cachedInputtokenCount) || 0;
  const output = Number(reply.outputtokenCount) || 0;
  const total = Number(reply.totalTokenCount) || 0;
  if (!ownerId || !opKey || !(input || cachedInput || output || total)) return;
  await AiBuilderOperation.updateOne(
    { ownerId, opKey, status: "running" },
    {
      $inc: {
        "tokens.input": input,
        "tokens.cachedInput": cachedInput,
        "tokens.output": output,
        "tokens.total": total,
      },
    },
  );
};

/**
 * Reserves the estimate before the first provider call. The hold either covers
 * the step or the step does not start, which is what keeps a run from stopping
 * halfway when the balance reaches zero.
 */
export const admitOperationCredit = async ({ draft, op, quotedCents }) => {
  // A resumed operation keeps the admission its first attempt paid for.
  if (Number(op?.holdCents) > 0) return { heldCents: Number(op.holdCents) };
  const cents = roundCents(Math.max(0, Number(quotedCents) || 0));
  if (!cents) {
    await AiBuilderOperation.updateOne(
      { _id: op._id },
      { $set: { quotedCents: 0, quotedAt: new Date() } },
    );
    return { heldCents: 0 };
  }
  const hold = await holdCredit({ schoolId: draft.school, userId: draft.ownerId, cents });
  if (!hold.ok) {
    throw builderError(
      402,
      "AI_CREDIT_REQUIRED",
      `This step needs about ${Math.ceil(cents)} credits and your available balance is ${Math.floor(Math.max(0, hold.availableCents))}.`,
    );
  }
  const recorded = await AiBuilderOperation.updateOne(
    { _id: op._id, status: "running", holdCents: 0 },
    { $set: { quotedCents: cents, quotedAt: new Date(), holdCents: cents } },
  );
  if (!recorded.modifiedCount) {
    // The operation ended or was already admitted elsewhere; never keep an
    // orphan reservation.
    await releaseCreditHold({ schoolId: draft.school, userId: draft.ownerId, cents });
  }
  return { heldCents: cents };
};

const operationReply = (op) => ({
  inputtokenCount: Math.max(0, Number(op?.tokens?.input) || 0),
  cachedInputtokenCount: Math.min(
    Math.max(0, Number(op?.tokens?.input) || 0),
    Math.max(0, Number(op?.tokens?.cachedInput) || 0),
  ),
  outputtokenCount: Math.max(0, Number(op?.tokens?.output) || 0),
  totalTokenCount: Math.max(0, Number(op?.tokens?.total) || 0),
  modelName: String(op?.model || liveLessonBuilderModel()),
});

/**
 * Charges a finished (or dead) operation exactly once from the calls it made,
 * capped at the estimate the teacher approved, and releases the rest of the
 * hold. The claim on `settledAt` makes a replay a no-op.
 */
export const settleOperationCredit = async ({ draftId, opKey }) => {
  const op = await AiBuilderOperation.findOneAndUpdate(
    { draftId, opKey, settledAt: null },
    { $set: { settledAt: new Date() } },
    { new: true },
  ).lean();
  if (!op) return null;

  const holdAmount = Math.max(0, Number(op.holdCents) || 0);
  const reply = operationReply(op);
  const rates = ratesForModel(reply.modelName);
  let charged = null;
  if (rates && reply.totalTokenCount > 0) {
    const providerCostCents = costCents({
      inputTokens: reply.inputtokenCount,
      cachedInputTokens: reply.cachedInputtokenCount,
      outputTokens: reply.outputtokenCount,
      totalTokens: reply.totalTokenCount,
    }, rates);
    const markupPercent = await getMarkupPercent().catch(() => 0);
    const quotedCents = Math.max(0, Number(op.quotedCents) || 0);
    // The platform absorbs anything above the approved estimate.
    const chargedCents = Math.min(applyMarkup(providerCostCents, markupPercent), quotedCents);
    charged = await chargeUsage({
      schoolId: op.school,
      userId: op.ownerId,
      reply,
      feature: LIVE_LESSON_BUILDER_FEATURE,
      outcome: "done",
      refs: { operationKey: op.opKey, draft: op.draftId },
      rates,
      chargedCents,
      holdCents: holdAmount,
    });
  }
  if (!charged?.charged && holdAmount) {
    await releaseCreditHold({ schoolId: op.school, userId: op.ownerId, cents: holdAmount });
  }
  await AiBuilderOperation.updateOne(
    { _id: op._id },
    {
      $set: {
        holdCents: 0,
        holdReleasedAt: new Date(),
        settledCents: charged?.charged ? charged.chargedCents : 0,
        creditEntryIds: charged?.charged && charged.entryId ? [charged.entryId] : [],
      },
    },
  );
  return charged?.charged
    ? { charged: true, chargedCents: charged.chargedCents, entryId: charged.entryId }
    : { charged: false, chargedCents: 0, entryId: "" };
};

/** True when this operation's first provider reply was already billed. */
export const operationWasCharged = async ({ schoolId, opKey }) => Boolean(await AiCreditEntry.exists({
  school: schoolId,
  operationKey: opKey,
  charged: true,
}));

export const builderUsage = ({ schoolId, userId, opKey, billable = true }) => ({
  schoolId,
  userId,
  feature: "live_lesson_builder",
  refs: { operationKey: opKey },
  billable,
});

export const MAX_OPERATION_LOCK_MS = LIVE_LESSON_BUILDER.operationTtlMs;
