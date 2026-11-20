import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

/**
 * K8: one row per school and failure class. The count is the monitor — repeated
 * provider or credit failures — and alertedAt is the throttle that keeps one
 * outage to one admin message instead of one per failed draft.
 */
const writingFailureAlertSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    code: { type: String, required: true, trim: true },
    count: { type: Number, default: 0, min: 0 },
    firstAt: { type: Date, default: null },
    lastAt: { type: Date, default: null },
    alertedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

writingFailureAlertSchema.index({ school: 1, code: 1 }, { unique: true });

writingFailureAlertSchema.plugin(tenantIsolationPlugin);

const WritingFailureAlert = mongoose.model(
  "WritingFailureAlert",
  writingFailureAlertSchema,
);
export default WritingFailureAlert;
