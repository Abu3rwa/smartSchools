import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const performanceReviewSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StaffProfile",
      required: true,
      index: true,
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    academicYear: { type: String, required: true },
    period: {
      type: String,
      enum: ["probation", "mid_year", "end_of_year", "annual", "quarterly_q1", "quarterly_q2", "quarterly_q3", "quarterly_q4", "special"],
      required: true,
    },
    reviewDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    // ─── Ratings ──────────────────────────────────
    ratings: [
      {
        category: { type: String, required: true, trim: true },
        score: { type: Number, required: true, min: 1, max: 5 },
        weight: { type: Number, default: 1, min: 0 },
        comment: { type: String, trim: true },
      },
    ],
    overallRating: { type: Number, min: 1, max: 5 },
    // ─── Narrative ────────────────────────────────
    strengths: { type: String, trim: true, maxlength: 3000 },
    areasForGrowth: { type: String, trim: true, maxlength: 3000 },
    actionPlan: { type: String, trim: true, maxlength: 3000 },
    // ─── Goals ────────────────────────────────────
    goals: [
      {
        description: { type: String, trim: true },
        targetDate: { type: Date },
        status: {
          type: String,
          enum: ["not_started", "in_progress", "completed", "deferred"],
          default: "not_started",
        },
      },
    ],
    // ─── Self-assessment ──────────────────────────
    selfAssessment: {
      submitted: { type: Boolean, default: false },
      submittedAt: { type: Date },
      ratings: [
        {
          category: { type: String, trim: true },
          score: { type: Number, min: 1, max: 5 },
          comment: { type: String, trim: true },
        },
      ],
      strengths: { type: String, trim: true },
      challenges: { type: String, trim: true },
      pdGoals: { type: String, trim: true },
    },
    // ─── Acknowledgment ───────────────────────────
    staffResponse: { type: String, trim: true, maxlength: 3000 },
    acknowledgedAt: { type: Date },
    disagreement: { type: Boolean, default: false },
    disagreementNote: { type: String, trim: true, maxlength: 2000 },
    // ─── Status ───────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "self_assessment", "in_review", "submitted", "acknowledged", "closed"],
      default: "draft",
    },
    // ─── Documents ────────────────────────────────
    attachments: [
      {
        name: { type: String, trim: true },
        url: { type: String, trim: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Pre-save: calculate overall rating from weighted scores
performanceReviewSchema.pre("save", function (next) {
  if (this.ratings && this.ratings.length > 0 && this.isModified("ratings")) {
    const totalWeight = this.ratings.reduce((sum, r) => sum + (r.weight || 1), 0);
    const weightedSum = this.ratings.reduce((sum, r) => sum + r.score * (r.weight || 1), 0);
    this.overallRating = Math.round((weightedSum / totalWeight) * 10) / 10;
  }
  next();
});

performanceReviewSchema.index({ school: 1, staff: 1, academicYear: 1, period: 1 });
performanceReviewSchema.index({ school: 1, status: 1 });
performanceReviewSchema.index({ school: 1, reviewer: 1 });

performanceReviewSchema.plugin(tenantIsolationPlugin);

const PerformanceReview = mongoose.model("PerformanceReview", performanceReviewSchema);
export default PerformanceReview;
