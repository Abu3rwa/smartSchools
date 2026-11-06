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

/** Reminder minutes Google counts backwards from the start of the event. */
const calendarSettingsSchema = new mongoose.Schema(
  {
    syncOn: { type: Boolean, default: true },
    autoAdd: { type: Boolean, default: false },
    autoAddSenders: {
      staff: { type: Boolean, default: true },
      parents: { type: Boolean, default: true },
      others: { type: Boolean, default: true },
    },
    meetingLengthMinutes: { type: Number, default: 60, min: 15, max: 240 },
    // 960 minutes before midnight of the due day is 08:00 the day before.
    deadlineReminderDateOnlyMinutes: {
      type: Number,
      default: 960,
      min: 0,
      max: 4320,
    },
    deadlineReminderTimedMinutes: {
      type: Number,
      default: 120,
      min: 0,
      max: 1440,
    },
    meetingReminderMinutes: { type: Number, default: 30, min: 0, max: 1440 },
    overlapEmail: { type: Boolean, default: true },
  },
  { _id: false },
);

/** The newsletter auto-reply opt-in: off until the teacher confirms the risk. */
const newsletterAutoReplySchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    confirmedRisk: { type: Boolean, default: false },
    hoursBeforeDeadline: { type: Number, default: 3, min: 0, max: 24 },
    deliveryMode: {
      type: String,
      enum: ["send", "draft_only"],
      default: "draft_only",
    },
    checkTimes: { type: [String], default: ["07:00", "18:00", "00:00"] },
  },
  { _id: false },
);

/** The "what's due" auto-reply opt-in: off until the teacher confirms the risk. */
const homeworkAutoReplySchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    confirmedRisk: { type: Boolean, default: false },
    scope: {
      type: String,
      enum: ["own_subject", "whole_class"],
      default: "own_subject",
    },
    daysAhead: { type: Number, default: 7, min: 1, max: 14 },
    deliveryMode: {
      type: String,
      enum: ["send", "draft_only"],
      default: "draft_only",
    },
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
    calendar: { type: calendarSettingsSchema, default: () => ({}) },
    newsletterAutoReply: {
      type: newsletterAutoReplySchema,
      default: () => ({}),
    },
    homeworkAutoReply: { type: homeworkAutoReplySchema, default: () => ({}) },
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
