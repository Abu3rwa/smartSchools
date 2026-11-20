import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

/** One student's place in a batch, kept after the run so failures can be retried. */
const batchItemSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WritingProject",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    // Snapshotted so the run stays readable without joining the roster.
    studentName: { type: String, trim: true, default: "" },
    draft: { type: mongoose.Schema.Types.ObjectId, ref: "WritingDraft" },
    status: {
      type: String,
      enum: ["pending", "running", "done", "failed", "skipped"],
      default: "pending",
    },
    assessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WritingAssessment",
    },
    // A precheck code or failure code, plus the sentence the teacher reads.
    code: { type: String, trim: true, default: "" },
    error: { type: String, trim: true, default: "" },
    startedAt: { type: Date },
    finishedAt: { type: Date },
  },
  { _id: false },
);

/**
 * One batch assessment request (F3). The run is the record: the endpoint
 * returns as soon as it starts, the teacher polls this row for live progress,
 * and a cancel only stops items that have not started yet.
 */
const writingBatchRunSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WritingAssignment",
      required: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // An admin can start a batch on a task they do not own; the runner needs
    // the same permission the start check used.
    requestedByAdmin: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["running", "done", "cancelled", "stopped", "interrupted"],
      default: "running",
    },
    cancelRequested: { type: Boolean, default: false },
    // `credit` means the run stopped because the balance ran short; its
    // remaining items are pending, not failed.
    stoppedReason: {
      type: String,
      enum: ["", "credit", "error"],
      default: "",
    },
    language: { type: String, trim: true, default: "" },
    // What the teacher confirmed before starting. Actual charges follow usage.
    estimate: {
      drafts: { type: Number, default: 0 },
      perDraftCents: { type: Number, default: 0 },
      totalCents: { type: Number, default: 0 },
      basis: { type: String, trim: true, default: "" },
    },
    items: { type: [batchItemSchema], default: [] },
  },
  { timestamps: true },
);

writingBatchRunSchema.index({ school: 1, assignment: 1, createdAt: -1 });
writingBatchRunSchema.index({ school: 1, requestedBy: 1, createdAt: -1 });
writingBatchRunSchema.plugin(tenantIsolationPlugin);

const WritingBatchRun = mongoose.model("WritingBatchRun", writingBatchRunSchema);
export default WritingBatchRun;
