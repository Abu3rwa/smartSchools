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
    replayAvailable: { type: Boolean, default: false },
    scheduledAt: { type: Date },
    meetingUrl: { type: String, trim: true, maxlength: 2048, default: "" },
    timerDurationMinutes: { type: Number, min: 0, max: 240, default: 0 },
    paused: { type: Boolean, default: false },
    pausedAt: { type: Date },
    totalPausedMs: { type: Number, min: 0, default: 0 },
    currentSlideIndex: { type: Number, default: 0, min: 0 },
    slideHidden: { type: Boolean, default: false },
    studentsFullscreen: { type: Boolean, default: false },
    questionOpen: { type: Boolean, default: false },
    revealedSlideIds: { type: [String], default: [] },
    // What one question of this session is worth. Written answers have no key, so the teacher marks
    // them against this allocation; questions left off here fall back to the default the mark sheet
    // offers.
    questionMarks: {
      type: [{ slideId: { type: String, required: true }, maxMarks: { type: Number, min: 0.25, max: 100, required: true } }],
      default: [],
      _id: false,
    },
    eventSeq: { type: Number, default: 0 },
    startedAt: { type: Date },
    endedAt: { type: Date },
  },
  { timestamps: true },
);

liveSessionSchema.index({ school: 1, teacherId: 1, createdAt: -1 });
liveSessionSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveSession || mongoose.model("LiveSession", liveSessionSchema);
