import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

/**
 * One scan attempt. The counters feed the daily limits and let the teacher see
 * what a scan actually cost without reading any email content.
 */
const inboxScanRunSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mode: { type: String, enum: ["refresh", "full"], required: true },
    status: {
      type: String,
      enum: ["running", "completed", "failed"],
      default: "running",
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    listedCount: { type: Number, default: 0, min: 0 },
    newCount: { type: Number, default: 0, min: 0 },
    skippedCount: { type: Number, default: 0, min: 0 },
    ruleClassifiedCount: { type: Number, default: 0, min: 0 },
    aiClassifiedCount: { type: Number, default: 0, min: 0 },
    aiFailedCount: { type: Number, default: 0, min: 0 },
    estimateCents: { type: Number, default: 0, min: 0 },
    charged: { type: Boolean, default: false },
    errorCode: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

inboxScanRunSchema.index({ user: 1, startedAt: -1 });
// One running scan per teacher: the unique index is what makes the lock atomic.
inboxScanRunSchema.index(
  { user: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "running" } },
);
inboxScanRunSchema.plugin(tenantIsolationPlugin);

const InboxScanRun = mongoose.model("InboxScanRun", inboxScanRunSchema);
export default InboxScanRun;
