import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const TONES = ["professional", "short", "warm", "formal"];
const MAX_CUSTOM_REPLY_TYPES = 20;

const customReplyTypeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    instruction: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false },
);

/** One row per teacher: opt-in state and the defaults every scan and draft starts from. */
const inboxAssistantSettingsSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    optedIn: { type: Boolean, default: false },
    optedInAt: { type: Date, default: null },
    scanSize: { type: Number, default: 25 },
    tone: { type: String, enum: TONES, default: "professional" },
    signature: { type: String, trim: true, maxlength: 500, default: "" },
    includeCcByDefault: { type: Boolean, default: false },
    nudgeAfterDays: { type: Number, default: 2, min: 1, max: 14 },
    customReplyTypes: {
      type: [customReplyTypeSchema],
      default: [],
      validate: {
        validator: (list) => list.length <= MAX_CUSTOM_REPLY_TYPES,
        message: `Keep at most ${MAX_CUSTOM_REPLY_TYPES} reply types of your own.`,
      },
    },
    lastScanAt: { type: Date, default: null },
  },
  { timestamps: true },
);

inboxAssistantSettingsSchema.index({ school: 1, user: 1 }, { unique: true });
inboxAssistantSettingsSchema.plugin(tenantIsolationPlugin);

const InboxAssistantSettings = mongoose.model(
  "InboxAssistantSettings",
  inboxAssistantSettingsSchema,
);
export default InboxAssistantSettings;
