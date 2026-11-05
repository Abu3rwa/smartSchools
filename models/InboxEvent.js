import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";
import { inboxCalendarItemFields } from "./inboxCalendarFields.js";

const STATES = ["proposed", "confirmed", "dismissed"];

/** A meeting the teacher attends at a time, found in one scanned email or added by hand. */
const inboxEventSchema = new mongoose.Schema(
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
      required() {
        return this.source !== "manual";
      },
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    // True when the email gave a start but no end, so the length is a guess.
    endAssumed: { type: Boolean, default: false },
    timeZone: { type: String, trim: true, maxlength: 64, default: "" },
    location: { type: String, trim: true, maxlength: 300, default: "" },
    quote: { type: String, trim: true, maxlength: 300, default: "" },
    state: { type: String, enum: STATES, default: "proposed" },
    source: { type: String, enum: ["ai", "manual"], required: true },
    ...inboxCalendarItemFields(),
  },
  { timestamps: true },
);

inboxEventSchema.index({ user: 1, state: 1, startAt: 1 });
inboxEventSchema.index({ "calendar.status": 1, "calendar.attempts": 1 });
inboxEventSchema.index({ "calendar.pendingRemoval": 1, "calendar.attempts": 1 });
inboxEventSchema.plugin(tenantIsolationPlugin);

const InboxEvent = mongoose.model("InboxEvent", inboxEventSchema);
export default InboxEvent;
