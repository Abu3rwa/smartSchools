import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const PRIORITIES = ["urgent", "needs_reply", "fyi", "ignore"];
const STATUSES = ["open", "done", "dismissed", "replied"];
const LANGUAGES = ["en", "ar", "other"];

/**
 * One scanned inbox message. The body text is cleared after the retention window;
 * the summary, priority and deadlines stay so the list keeps working.
 */
const inboxEmailSchema = new mongoose.Schema(
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
    gmailMessageId: { type: String, required: true, trim: true },
    threadId: { type: String, required: true, trim: true },
    receivedAt: { type: Date, required: true },
    fromName: { type: String, trim: true, maxlength: 200, default: "" },
    fromEmail: { type: String, trim: true, lowercase: true, maxlength: 320, default: "" },
    replyToEmail: { type: String, trim: true, lowercase: true, maxlength: 320, default: "" },
    ccEmails: { type: [String], default: [] },
    toEmails: { type: [String], default: [] },
    subject: { type: String, trim: true, maxlength: 300, default: "" },
    messageIdHeader: { type: String, trim: true, default: "" },
    referencesHeader: { type: String, trim: true, default: "" },
    bodyText: { type: String, default: "" },
    bodyPurgedAt: { type: Date, default: null },
    bodyHash: { type: String, trim: true, default: "" },
    language: { type: String, enum: LANGUAGES, default: "other" },
    senderRole: { type: String, trim: true, lowercase: true, default: "" },
    priority: { type: String, enum: PRIORITIES, required: true },
    status: { type: String, enum: STATUSES, default: "open" },
    summary: { type: String, trim: true, maxlength: 300, default: "" },
    reason: { type: String, trim: true, maxlength: 200, default: "" },
    suggestedReplyType: { type: String, trim: true, default: null },
    classifiedBy: { type: String, enum: ["rule", "ai"] },
    scanRun: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InboxScanRun",
      default: null,
    },
    repliedDetectedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

inboxEmailSchema.index({ user: 1, gmailMessageId: 1 }, { unique: true });
inboxEmailSchema.index({ user: 1, status: 1, priority: 1, receivedAt: -1 });
inboxEmailSchema.index({ user: 1, threadId: 1 });
inboxEmailSchema.index({ user: 1, bodyPurgedAt: 1, createdAt: 1 });
inboxEmailSchema.plugin(tenantIsolationPlugin);

const InboxEmail = mongoose.model("InboxEmail", inboxEmailSchema);
export default InboxEmail;
