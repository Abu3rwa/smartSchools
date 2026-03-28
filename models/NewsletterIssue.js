import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

/**
 * NewsletterIssue
 * One newsletter per class (per school) for a specific period.
 * The period can be weekly, biweekly, or monthly — configured per school + department.
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

    // Period boundary — weekStart/weekEnd kept for backward compatibility.
    // New code should use periodStart/periodEnd virtuals or set weekStart/weekEnd directly.
    weekStart: { type: Date, required: true, index: true },
    weekEnd: { type: Date, required: true },

    // The cadence that was active when this issue was created (stamped for history).
    frequency: {
      type: String,
      enum: ["weekly", "biweekly", "monthly"],
      default: "weekly",
    },

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

// One issue per class/period (unique on weekStart which serves as periodStart)
newsletterIssueSchema.index(
  { school: 1, class: 1, academicYear: 1, weekStart: 1 },
  { unique: true }
);

// Virtual aliases: periodStart ↔ weekStart, periodEnd ↔ weekEnd
newsletterIssueSchema.virtual("periodStart").get(function () { return this.weekStart; }).set(function (v) { this.weekStart = v; });
newsletterIssueSchema.virtual("periodEnd").get(function () { return this.weekEnd; }).set(function (v) { this.weekEnd = v; });

newsletterIssueSchema.plugin(tenantIsolationPlugin);

const NewsletterIssue = mongoose.model("NewsletterIssue", newsletterIssueSchema);
export default NewsletterIssue;

