import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";
import { LIVE_LESSON_BUILDER } from "../config/liveLessonBuilderConfig.js";

const { Schema } = mongoose;

/**
 * One client-initiated AI step (plan, generate, regenerate, approve) and its
 * outcome. The unique key is what makes a retry safe: the same key can never
 * call the provider or charge the teacher twice. No AI text is stored here —
 * the draft is the only copy of lesson content.
 */
const aiBuilderOperationSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    draftId: { type: Schema.Types.ObjectId, ref: "LiveLessonDraft", required: true, index: true },
    opKey: { type: String, required: true, maxlength: 80 },
    type: { type: String, enum: ["plan", "generate", "regenerate", "approve"], required: true },
    payloadHash: { type: String, default: "", maxlength: 80 },
    baseVersion: { type: Number, default: 0, min: 0 },
    itemIds: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["running", "succeeded", "partial", "failed", "expired", "cancelled"],
      default: "running",
      index: true,
    },
    attempt: { type: Number, default: 1, min: 1 },
    lockExpiresAt: { type: Date, default: null },
    model: { type: String, default: "", maxlength: 80 },
    creditEntryIds: { type: [String], default: [] },
    tokens: {
      input: { type: Number, default: 0, min: 0 },
      cachedInput: { type: Number, default: 0, min: 0 },
      output: { type: Number, default: 0, min: 0 },
      total: { type: Number, default: 0, min: 0 },
    },
    // Admission: the estimate the teacher saw and the amount held against it.
    // Settlement charges the used tokens once, never above `quotedCents`, then
    // releases the rest of the hold.
    quotedCents: { type: Number, default: 0, min: 0 },
    quotedAt: { type: Date, default: null },
    holdCents: { type: Number, default: 0, min: 0 },
    holdReleasedAt: { type: Date, default: null },
    settledAt: { type: Date, default: null },
    settledCents: { type: Number, default: 0, min: 0 },
    // Codes and counts only: a provider message can quote the source text.
    errorCode: { type: String, default: "", maxlength: 60 },
    itemFailures: {
      type: [{ itemId: String, code: String }],
      default: [],
    },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: () => new Date(Date.now() + LIVE_LESSON_BUILDER.operationTtlMs) },
  },
  { timestamps: true },
);

aiBuilderOperationSchema.index({ draftId: 1, opKey: 1 }, { unique: true });
aiBuilderOperationSchema.index(
  { ownerId: 1 },
  { unique: true, partialFilterExpression: { status: "running" } },
);
aiBuilderOperationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

aiBuilderOperationSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.AiBuilderOperation
  || mongoose.model("AiBuilderOperation", aiBuilderOperationSchema);
