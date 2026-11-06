import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const STATUSES = ["draft", "sending", "sent", "discarded"];
const TONES = ["professional", "short", "warm", "formal"];

/**
 * A reply the assistant wrote for one email. It is only a record until the
 * teacher confirms Send; `sendIdempotencyKey` makes a double click one email.
 */
const inboxReplyDraftSchema = new mongoose.Schema(
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
      required: true,
    },
    replyType: { type: String, trim: true, default: "" },
    tone: { type: String, enum: TONES, default: "professional" },
    language: { type: String, enum: ["en", "ar"], default: "en" },
    subject: { type: String, trim: true, maxlength: 300, default: "" },
    body: { type: String, maxlength: 8000, default: "" },
    assumptions: { type: [String], default: [] },
    to: { type: [String], default: [] },
    cc: { type: [String], default: [] },
    gmailDraftId: { type: String, trim: true, default: null },
    status: { type: String, enum: STATUSES, default: "draft" },
    source: { type: String, enum: ["manual", "auto"], default: "manual" },
    sendIdempotencyKey: { type: String, trim: true, default: null },
    sentMessageId: { type: String, trim: true, default: null },
    threadId: { type: String, trim: true, default: null },
    sentAt: { type: Date, default: null },
    aiUsageEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiCreditEntry",
      default: null,
    },
  },
  { timestamps: true },
);

inboxReplyDraftSchema.index({ user: 1, status: 1, sentAt: -1 });
inboxReplyDraftSchema.index({ user: 1, email: 1, status: 1 });
inboxReplyDraftSchema.plugin(tenantIsolationPlugin);

const InboxReplyDraft = mongoose.model("InboxReplyDraft", inboxReplyDraftSchema);
export default InboxReplyDraft;
