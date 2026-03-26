import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";
import { normalizeLessonObjectives } from '../helpers/lessonObjectives.js';

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
    objectives: [
      {
        objectiveKey: {
          type: String,
          required: true,
          trim: true,
        },
        text: {
          type: String,
          required: true,
          trim: true,
        },
        standardIds: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Standard',
          },
        ],
        order: {
          type: Number,
          default: 0,
        },
      },
    ],
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
    // Teacher-typed custom standards (not from the Standard collection)
    manualStandards: [
      {
        code: { type: String, trim: true, default: '' },
        name: { type: String, trim: true, default: '' },
        description: { type: String, trim: true, default: '' },
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
    // Additional context for AI
    contextText: {
      type: String,
      trim: true,
      default: ''
    },
    extractedMaterialText: {
      type: String,
      default: ''
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
    aiEvaluationStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed', 'failed'],
      default: 'not_started',
      index: true
    },
    aiEvaluationRequestedAt: {
      type: Date
    },
    aiEvaluationCompletedAt: {
      type: Date
    },
    aiEvaluationLastError: {
      type: String,
      default: ''
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
    aiEvaluationMeta: {
      criteriaHash: String,
      lessonContentHash: String,
      criteriaCount: Number,
      criteriaSnapshot: [{
        criteriaId: String,
        name: String,
        description: String,
        weight: Number,
        minScore: Number,
        isRequired: Boolean,
        evaluationPrompt: String,
        updatedAt: String
      }],
      promptVersion: String,
      model: String,
      triggeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      triggerSource: {
        type: String,
        enum: ['teacher_submit', 'admin_manual', 'system_recheck']
      },
      latencyMs: Number
    },
    aiEvaluationHistory: [{
      evaluationId: String,
      evaluatedAt: Date,
      overallScore: Number,
      meetsMinimumRequirements: Boolean,
      criteriaScores: [{
        criteriaId: String,
        criteriaName: String,
        score: Number,
        feedback: String,
        metMinimum: Boolean
      }],
      strengths: [String],
      areasForImprovement: [String],
      recommendations: [String],
      meta: {
        criteriaHash: String,
        lessonContentHash: String,
        criteriaCount: Number,
        promptVersion: String,
        model: String,
        triggerSource: {
          type: String,
          enum: ['teacher_submit', 'admin_manual', 'system_recheck']
        },
        triggeredBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        reason: String,
        latencyMs: Number
      }
    }],
    // Human review (optional)
    humanReview: {
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      reviewedAt: Date,
      comments: String,
      finalStatus: String
    },
    // Admin note to the teacher about this lesson plan (visible to teacher)
    adminNoteToTeacher: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { timestamps: true },
);

lessonPlanSchema.index({ school: 1, date: -1 });
lessonPlanSchema.index({ school: 1, class: 1, subject: 1 });
lessonPlanSchema.index({ school: 1, teacher: 1, status: 1 });
lessonPlanSchema.index({ school: 1, status: 1, submittedAt: -1 });
lessonPlanSchema.index({ school: 1, aiEvaluationStatus: 1, updatedAt: -1 });
lessonPlanSchema.index({ school: 1, 'aiEvaluationMeta.criteriaHash': 1 });

lessonPlanSchema.pre('validate', function (next) {
  this.objectives = normalizeLessonObjectives({
    objectives: this.objectives,
    teachingObjectives: this.teachingObjectives,
    standardIds: this.standardIds,
  }).map((objective) => ({
    objectiveKey: objective.objectiveKey,
    text: objective.text,
    standardIds: objective.standardIds,
    order: objective.order,
  }));
  next();
});

lessonPlanSchema.plugin(tenantIsolationPlugin);

const LessonPlan = mongoose.model("LessonPlan", lessonPlanSchema);
export default LessonPlan;
