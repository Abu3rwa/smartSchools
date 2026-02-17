import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const lessonPlanSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    summary: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    homework: {
      type: String,
      default: "",
    },
    // Detailed section
    previousKnowledge: {
      type: String,
      default: "",
    },
    teachingObjectives: {
      type: String,
      default: "",
    },
    vocabulary: {
      type: String,
      default: "",
    },
    characterTraitLinks: {
      type: String,
      default: "",
    },
    techIntegration: {
      type: String,
      default: "",
    },
    // Stages: procedure, materials/resources, timing
    stages: [
      {
        name: { type: String, default: "" },
        procedure: { type: String, default: "" },
        materials: { type: String, default: "" },
        timing: { type: String, default: "" },
      },
    ],
    // Linked curriculum standards (AI-detected or manually selected)
    standardIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Standard",
      },
    ],
    // Additional fields for AI evaluation
    weekNumber: {
      type: Number,
      min: 1,
      max: 52
    },
    topic: {
      type: String,
      trim: true,
      maxlength: 200
    },
    learningObjectives: {
      type: String,
      trim: true
    },
    activities: {
      type: String,
      trim: true
    },
    assessmentMethods: {
      type: String,
      trim: true
    },
    resources: {
      type: String,
      trim: true
    },
    differentiation: {
      type: String,
      trim: true
    },
    notes: {
      type: String,
      trim: true
    },
    // Status tracking
    status: {
      type: String,
      enum: ['draft', 'submitted', 'approved', 'needs_revision', 'rejected'],
      default: 'draft',
      index: true
    },
    submittedAt: {
      type: Date
    },
    evaluatedAt: {
      type: Date
    },
    // AI Evaluation results
    aiEvaluation: {
      overallScore: {
        type: Number,
        min: 0,
        max: 100
      },
      criteriaScores: [{
        criteriaId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'LessonPlanCriteria'
        },
        criteriaName: String,
        score: {
          type: Number,
          min: 0,
          max: 100
        },
        feedback: String,
        metMinimum: Boolean
      }],
      strengths: [String],
      areasForImprovement: [String],
      recommendations: [String],
      meetsMinimumRequirements: Boolean,
      evaluatedBy: {
        type: String,
        default: 'AI'
      },
      evaluatedAt: Date
    },
    // Human review (optional)
    humanReview: {
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reviewedAt: Date,
      comments: String,
      finalStatus: String
    }
  },
  { timestamps: true },
);

lessonPlanSchema.index({ school: 1, date: -1 });
lessonPlanSchema.index({ school: 1, class: 1, subject: 1 });
lessonPlanSchema.index({ school: 1, teacher: 1, status: 1 });
lessonPlanSchema.index({ school: 1, status: 1, submittedAt: -1 });
lessonPlanSchema.plugin(tenantIsolationPlugin);

const LessonPlan = mongoose.model("LessonPlan", lessonPlanSchema);
export default LessonPlan;
