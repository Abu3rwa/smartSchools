import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const draftSectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    index: { type: Number, default: 0 },
    label: { type: String, trim: true, default: "" },
    text: { type: String, default: "" },
    words: { type: Number, default: 0 },
  },
  { _id: false },
);

/** Blocked pastes made while this version was being written, copied at submission. */
const pasteAttemptSchema = new mongoose.Schema(
  {
    at: { type: Date },
    key: { type: String, trim: true, default: "" },
    index: { type: Number, default: 0 },
    chars: { type: Number, min: 0, default: 0 },
    text: { type: String, default: "" },
  },
  { _id: false },
);

/**
 * A submitted version of a student's writing. Created once, never edited:
 * every later revision is stored as the next `number` for the same project.
 */
const writingDraftSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WritingProject",
      required: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WritingAssignment",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    number: { type: Number, required: true, min: 1 },
    title: { type: String, trim: true, default: "" },
    sections: { type: [draftSectionSchema], default: [] },
    totalWords: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
    submissionSource: {
      type: String,
      enum: ["student", "teacher"],
      default: "student",
    },
    pasteAttempts: { type: [pasteAttemptSchema], default: [] },
    // F13: a submission the teacher pulled back before anything was published.
    // A withdrawn draft keeps its number so the next submit reuses it, but it
    // is not a revision: it never counts, compares or publishes.
    withdrawn: { type: Boolean, default: false },
    withdrawal: {
      at: { type: Date },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: { type: String, trim: true, default: "" },
    },
    configSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

// Numbering is unique among live drafts only: a returned submission keeps its
// number for the audit trail while the next submit takes that number back (F13).
writingDraftSchema.index(
  { school: 1, project: 1, number: 1 },
  { unique: true, partialFilterExpression: { withdrawn: false } },
);
writingDraftSchema.index({ school: 1, student: 1, submittedAt: -1 });
writingDraftSchema.plugin(tenantIsolationPlugin);

const WritingDraft = mongoose.model("WritingDraft", writingDraftSchema);
export default WritingDraft;
