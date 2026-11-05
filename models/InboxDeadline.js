import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";
import { inboxCalendarItemFields } from "./inboxCalendarFields.js";

const STATES = ["proposed", "confirmed", "done", "dismissed"];

/** A date a teacher has to meet, taken from one scanned email. Proposed until the teacher confirms it. */
const inboxDeadlineSchema = new mongoose.Schema(
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
    email: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InboxEmail",
      default: null,
      // Scanned deadlines always come from one email; a manual one may not.
      required() {
        return this.source !== "manual";
      },
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    dueAt: { type: Date, required: true },
    dueDateOnly: { type: Boolean, default: true },
    timeZone: { type: String, trim: true, maxlength: 64, default: "" },
    quote: { type: String, trim: true, maxlength: 300, default: "" },
    state: { type: String, enum: STATES, default: "proposed" },
    remindAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    source: { type: String, enum: ["ai", "manual"], required: true },
    ...inboxCalendarItemFields(),
  },
  { timestamps: true },
);

inboxDeadlineSchema.index({ user: 1, state: 1, dueAt: 1 });
inboxDeadlineSchema.index({ state: 1, remindAt: 1, reminderSentAt: 1 });
// The retry job only ever looks at items that still owe Google a call.
inboxDeadlineSchema.index({ "calendar.status": 1, "calendar.attempts": 1 });
inboxDeadlineSchema.index({ "calendar.pendingRemoval": 1, "calendar.attempts": 1 });
inboxDeadlineSchema.plugin(tenantIsolationPlugin);

const InboxDeadline = mongoose.model("InboxDeadline", inboxDeadlineSchema);
export default InboxDeadline;
