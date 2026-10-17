import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;

const liveLessonFolderSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    parentId: { type: Schema.Types.ObjectId, ref: "LiveLessonFolder", default: null },
    sortOrder: { type: Number, default: 0 },
    lessonIds: { type: [{ type: Schema.Types.ObjectId, ref: "LiveLesson" }], default: [] },
  },
  { timestamps: true },
);

liveLessonFolderSchema.index({ school: 1, ownerId: 1, parentId: 1, sortOrder: 1 });
liveLessonFolderSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveLessonFolder ||
  mongoose.model("LiveLessonFolder", liveLessonFolderSchema);
