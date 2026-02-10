import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

/**
 * NewsletterIssue
 * One weekly newsletter per class (per school) for a specific week range.
 * Teachers contribute subject sections; admins review/exclude subjects and send.
 */
const newsletterIssueSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },
    academicYear: {
      type: String,
      required: true,
      index: true,
    },

    // Week boundary (recommended: Monday 00:00 local time)
    weekStart: { type: Date, required: true, index: true },
    weekEnd: { type: Date, required: true },

    status: {
      type: String,
      enum: ["draft", "ready_for_send", "sent", "cancelled"],
      default: "draft",
      index: true,
    },

    // Subjects the admin chose to exclude from the combined email.
    excludedSubjectIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Subject", default: [] },
    ],

    // Sending metadata
    sentAt: { type: Date },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastSendError: { type: String, default: "" },

    emailStats: {
      studentsCount: { type: Number, default: 0 },
      familiesEmailedCount: { type: Number, default: 0 },
      recipientEmailsCount: { type: Number, default: 0 },
      successCount: { type: Number, default: 0 },
      failureCount: { type: Number, default: 0 },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One issue per class/week
newsletterIssueSchema.index(
  { school: 1, class: 1, academicYear: 1, weekStart: 1 },
  { unique: true }
);

newsletterIssueSchema.plugin(tenantIsolationPlugin);

const NewsletterIssue = mongoose.model("NewsletterIssue", newsletterIssueSchema);
export default NewsletterIssue;

