import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;

const liveSessionEventSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "LiveSession", required: true },
    seq: { type: Number, required: true },
    type: { type: String, required: true, maxlength: 40 },
    at: { type: Date, required: true, default: Date.now },
    offsetMs: { type: Number, required: true, min: 0 },
    actor: {
      role: { type: String, enum: ["teacher", "student", "system"], required: true },
      userId: { type: Schema.Types.ObjectId, ref: "User" },
    },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: false },
);

liveSessionEventSchema.index({ sessionId:  1, seq: 1 }, { unique: true });
liveSessionEventSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveSessionEvent || mongoose.model("LiveSessionEvent", liveSessionEventSchema);
