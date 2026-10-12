import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;

const liveResponseSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "LiveSession", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    slideId: { type: String, required: true },
    selectedOptionId: { type: String, required: true, maxlength: 20 },
    isCorrect: { type: Boolean, required: true },
    submittedAt: { type: Date, required: true, default: Date.now },
    latencyMs: { type: Number, min: 0 },
  },
  { timestamps: false },
);

liveResponseSchema.index({ sessionId: 1, studentId: 1, slideId: 1 }, { unique: true });
liveResponseSchema.index({ school: 1, sessionId: 1 });
liveResponseSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveResponse || mongoose.model("LiveResponse", liveResponseSchema);
