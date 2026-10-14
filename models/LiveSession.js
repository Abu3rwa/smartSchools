import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;

const liveSessionSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: "LiveLesson", required: true },
    lessonSnapshot: { type: Schema.Types.Mixed, required: true },
    rosterSnapshot: {
      type: [{ studentId: { type: String, required: true }, name: { type: String, default: "" } }],
      default: [],
    },
    rosterCapturedAt: { type: Date },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    joinCode: { type: String, required: true, unique: true, uppercase: true, minlength: 6, maxlength: 6 },
    status: { type: String, enum: ["waiting", "live", "ended"], default: "waiting", index: true },
    paused: { type: Boolean, default: false },
    currentSlideIndex: { type: Number, default: 0, min: 0 },
    slideHidden: { type: Boolean, default: false },
    studentsFullscreen: { type: Boolean, default: false },
    questionOpen: { type: Boolean, default: false },
    revealedSlideIds: { type: [String], default: [] },
    eventSeq: { type: Number, default: 0 },
    startedAt: { type: Date },
    endedAt: { type: Date },
  },
  { timestamps: true },
);

liveSessionSchema.index({ school: 1, teacherId: 1, createdAt: -1 });
liveSessionSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveSession || mongoose.model("LiveSession", liveSessionSchema);
