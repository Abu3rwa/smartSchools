import AiBuilderOperation from "../models/AiBuilderOperation.js";
import LiveLessonDraft from "../models/LiveLessonDraft.js";
import { settleOperationCredit } from "../services/liveLessonBuilderOperationService.js";
import logger from "../utils/logger.js";

/**
 * A builder operation that died mid-run leaves its admission hold behind. The
 * lock expiry already stops a stuck operation from running; this sweep settles
 * whatever tokens the dead request recorded (capped at its estimate), releases
 * the reservation and clears the draft lock, so credit can never stay stuck.
 */
export const releaseStaleBuilderHolds = async ({ now = new Date(), limit = 50 } = {}) => {
  const stale = await AiBuilderOperation.find({
    holdCents: { $gt: 0 },
    settledAt: null,
    $or: [
      { status: { $in: ["succeeded", "partial", "failed", "expired", "cancelled"] } },
      { lockExpiresAt: { $lt: now } },
    ],
  })
    .select("_id school ownerId draftId opKey status holdCents lockExpiresAt")
    .limit(limit)
    .lean();

  const summary = { scanned: stale.length, settled: 0, released: 0, errors: [] };
  for (const op of stale) {
    try {
      if (op.status === "running") {
        const expired = await AiBuilderOperation.findOneAndUpdate(
          { _id: op._id, status: "running" },
          { $set: { status: "expired", completedAt: now } },
          { new: true },
        ).lean();
        if (!expired) continue;
        await LiveLessonDraft.updateOne(
          { _id: op.draftId, "activeOp.opKey": op.opKey },
          { $set: { activeOp: null } },
        );
      }
      const settled = await settleOperationCredit({ draftId: op.draftId, opKey: op.opKey });
      if (settled?.charged) summary.settled += 1;
      else summary.released += 1;
    } catch (error) {
      summary.errors.push({ operationId: String(op._id), message: error?.message });
    }
  }
  if (summary.errors.length) {
    logger.warn("builder_credit_hold_sweep_errors", { count: summary.errors.length });
  }
  return summary;
};

export default releaseStaleBuilderHolds;
