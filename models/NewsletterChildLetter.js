import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

/**
 * NewsletterChildLetter
 * One personalized letter per student for a class period. The stored content is
 * anonymous prose containing a {{student}} name slot; the child's name is inserted
 * only when the email is rendered. `facts` is the exact anonymous snapshot the AI
 * was given, kept so a teacher can see why the letter says what it says.
 */
const newsletterChildLetterSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    issue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NewsletterIssue",
      required: true,
      index: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    academicYear: { type: String, trim: true, default: "" },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    language: { type: String, trim: true, lowercase: true, default: "english" },
    requestedLanguages: [{ type: String, trim: true, lowercase: true }],

    // Which fact groups the teacher chose to include.
    sources: [{ type: String, trim: true }],

    // Anonymous snapshot given to the AI. Never contains a name, email or id.
    facts: { type: mongoose.Schema.Types.Mixed, default: {} },

    // "What the class covered" chips, copied from the class-level facts.
    classTopics: [
      {
        subject: { type: String, trim: true, default: "" },
        topics: [{ type: String, trim: true }],
      },
    ],

    // Anonymous prose with {{student}} slots. Names are filled at render time only.
    content: { type: String, default: "" },
    wordCount: { type: Number, default: 0 },

    // The teacher's own sentence to this family, shown instead of the classwork
    // remark when present. Written after generation, so it never reaches the AI.
    teacherNote: { type: String, default: "", trim: true },

    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected"],
      default: "draft",
      index: true,
    },
    submittedAt: { type: Date },

    adminReview: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: { type: Date },
      notes: { type: String, default: "" },
    },

    // Credit receipt for the generation call (the ledger row is authoritative).
    aiUsage: {
      entryId: { type: String, default: "" },
      charged: { type: Boolean, default: false },
      costCents: { type: Number, default: 0 },
      model: { type: String, default: "" },
      totalTokens: { type: Number, default: 0 },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    teacherProfile: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },

    sentAt: { type: Date, default: null },
    lastSendError: { type: String, default: "" },
  },
  { timestamps: true }
);

newsletterChildLetterSchema.index(
  { school: 1, issue: 1, student: 1 },
  { unique: true }
);
newsletterChildLetterSchema.index({ school: 1, class: 1, periodStart: 1, status: 1 });

newsletterChildLetterSchema.plugin(tenantIsolationPlugin);

const NewsletterChildLetter = mongoose.model(
  "NewsletterChildLetter",
  newsletterChildLetterSchema
);
export default NewsletterChildLetter;
