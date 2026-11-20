import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

/**
 * Lesson facts a teacher can reuse across writing tasks.
 *
 * Facts carry server-assigned ids (`f1`, `f2`, …) so a reply can point at one
 * without inventing its text. Editing a pack bumps `version`; drafts already
 * submitted keep the snapshot they were assessed under.
 */
const factSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const writingSourcePackSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    // The teacher's original paste, kept for reference. Only `facts` is ever
    // sent to the model.
    sourceText: { type: String, trim: true, default: "" },
    facts: { type: [factSchema], default: [] },
    version: { type: Number, default: 1, min: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

writingSourcePackSchema.index({ school: 1, isArchived: 1, updatedAt: -1 });
writingSourcePackSchema.plugin(tenantIsolationPlugin);

const WritingSourcePack = mongoose.model(
  "WritingSourcePack",
  writingSourcePackSchema,
);
export default WritingSourcePack;
