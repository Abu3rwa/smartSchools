import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;

const gradeSchema = new Schema(
  {
    status: { type: String, enum: ["auto", "pending", "graded"], default: "auto" },
    marks: { type: Number, min: 0, default: null },
    maxMarks: { type: Number, min: 0, default: null },
    feedback: { type: String, maxlength: 2000, default: "" },
    gradedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt: { type: Date, default: null },
    // A written answer stays hidden from the student until the teacher releases it, which is also
    // the gate any drafted feedback has to pass through.
    released: { type: Boolean, default: false },
    source: { type: String, enum: ["objective", "teacher", "ai"], default: "objective" },
  },
  { _id: false },
);

const liveResponseSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "LiveSession", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    slideId: { type: String, required: true },
    // Only mcq and tf fill selectedOptionId; newer kinds answer through `response` or `text`.
    selectedOptionId: { type: String, maxlength: 20, default: "" },
    response: { type: Schema.Types.Mixed, default: null },
    text: { type: String, maxlength: 4000, default: "" },
    isCorrect: { type: Boolean, default: null },
    score: { type: Number, min: 0, max: 1, default: null },
    grade: { type: gradeSchema, default: undefined },
    submittedAt: { type: Date, required: true, default: Date.now },
    latencyMs: { type: Number, min: 0 },
  },
  { timestamps: false },
);

liveResponseSchema.index({ sessionId: 1, studentId: 1, slideId: 1 }, { unique: true });
liveResponseSchema.index({ school: 1, sessionId: 1 });
liveResponseSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveResponse || mongoose.model("LiveResponse", liveResponseSchema);
