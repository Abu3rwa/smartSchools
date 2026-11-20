import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

/** The skills a bank note can be tagged with, matching the review vocabulary. */
export const COMMENT_SKILLS = [
  "organisation",
  "evidence",
  "clarity",
  "focus",
  "grammar",
  "vocabulary",
  "other",
];

/**
 * One note a teacher saved for reuse (F2). A note is private to the teacher
 * unless they explicitly share it with the school (Q10). The section and the
 * section's criteria it was written for are kept so the drawer can rank
 * suggestions for the section being edited.
 */
const writingCommentBankSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 260 },
    skill: { type: String, enum: COMMENT_SKILLS, default: "other" },
    sectionKeys: { type: [String], default: [] },
    criterionKeys: { type: [String], default: [] },
    usageCount: { type: Number, default: 0, min: 0 },
    lastUsedAt: { type: Date },
    sharedWithSchool: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// The drawer reads one teacher's bank (plus shared notes) and ranks in memory;
// the index keeps that read small. One text is stored once per teacher.
writingCommentBankSchema.index({ school: 1, teacher: 1, usageCount: -1 });
writingCommentBankSchema.index(
  { school: 1, teacher: 1, text: 1 },
  { unique: true },
);
writingCommentBankSchema.plugin(tenantIsolationPlugin);

const WritingCommentBank = mongoose.model(
  "WritingCommentBank",
  writingCommentBankSchema,
);
export default WritingCommentBank;
