import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;

const liveLessonShareInvitationSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    sourceLessonId: { type: Schema.Types.ObjectId, ref: "LiveLesson", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lessonSnapshot: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "revoked"],
      default: "pending",
      required: true,
    },
    acceptedLessonId: { type: Schema.Types.ObjectId, ref: "LiveLesson", default: null },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

liveLessonShareInvitationSchema.index(
  { school: 1, sourceLessonId: 1, recipientId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
liveLessonShareInvitationSchema.index({ school: 1, recipientId: 1, createdAt: -1 });
liveLessonShareInvitationSchema.index({ school: 1, senderId: 1, createdAt: -1 });
liveLessonShareInvitationSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveLessonShareInvitation ||
  mongoose.model("LiveLessonShareInvitation", liveLessonShareInvitationSchema);
