import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const { Schema } = mongoose;

/**
 * A named ability group inside one class, reused across lessons. Live questions are then sent to
 * a group instead of to a tick-list of students, which keeps the realtime payloads per-group.
 */
const liveGroupSchema = new Schema(
  {
    school: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    studentIds: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    order: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

liveGroupSchema.index({ school: 1, classId: 1, order: 1 });
liveGroupSchema.index(
  { school: 1, classId: 1, name: 1 },
  { unique: true, partialFilterExpression: { classId: { $type: "objectId" } } },
);
liveGroupSchema.plugin(tenantIsolationPlugin);

export default mongoose.models.LiveGroup || mongoose.model("LiveGroup", liveGroupSchema);
