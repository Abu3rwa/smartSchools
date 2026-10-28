import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const sectionFeedbackSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    index: { type: Number, default: 0 },
    label: { type: String, trim: true, default: '' },
    strengths: [{ type: String, trim: true }],
    improvements: [{ type: String, trim: true }],
    evidence: { type: String, trim: true, default: '' },
    why: { type: String, trim: true, default: '' },
    nextStep: { type: String, trim: true, default: '' },
    score: { type: Number, min: 0, max: 1000 },
    maxScore: { type: Number, min: 0, max: 1000 }
  },
  { _id: false }
);

const changedSectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    index: { type: Number, default: 0 },
    label: { type: String, trim: true, default: '' },
    summary: { type: String, trim: true, default: '' },
    meaningful: { type: Boolean, default: false },
    kind: { type: String, enum: ['changed', 'added', 'removed'], default: 'changed' }
  },
  { _id: false }
);

const feedbackAppliedSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    index: { type: Number, default: 0 },
    note: { type: String, trim: true, default: '' },
    applied: { type: Boolean, default: false }
  },
  { _id: false }
);

/**
 * AI output for one draft version, plus the teacher's edits.
 * `kind: 'feedback'` assesses a draft. `kind: 'comparison'` assesses what changed
 * between two drafts. A reassessment is a new document so the older one survives.
 */
const writingAssessmentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingProject', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingAssignment', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    draft: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingDraft', required: true },
    previousDraft: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingDraft' },
    kind: { type: String, enum: ['feedback', 'comparison'], default: 'feedback' },
    // The language the feedback text itself was written in. A family email must
    // not dress English sentences in Arabic chrome, so it follows this.
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    aiStatus: {
      type: String,
      enum: ['pending', 'running', 'done', 'failed'],
      default: 'pending'
    },
    aiError: { type: String, trim: true, default: '' },
    attempts: { type: Number, default: 0, min: 0 },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ranAt: { type: Date },
    modelUsed: { type: String, trim: true, default: '' },
    sections: { type: [sectionFeedbackSchema], default: [] },
    overall: {
      summary: { type: String, trim: true, default: '' },
      nextPriorities: [{ type: String, trim: true }],
      organisation: { type: String, trim: true, default: '' },
      centralIdea: { type: String, trim: true, default: '' },
      flow: { type: String, trim: true, default: '' },
      repetition: { type: String, trim: true, default: '' },
      requirements: { type: String, trim: true, default: '' }
    },
    scores: [
      {
        key: { type: String, trim: true },
        label: { type: String, trim: true },
        score: { type: Number, min: 0, max: 1000 },
        maxScore: { type: Number, min: 0, max: 1000 },
        explanation: { type: String, trim: true, default: '' }
      }
    ],
    totalScore: { type: Number, default: 0 },
    comparison: {
      changedBySection: { type: [changedSectionSchema], default: [] },
      criteriaImproved: [{ type: String, trim: true }],
      criteriaUnresolved: [{ type: String, trim: true }],
      feedbackApplied: { type: [feedbackAppliedSchema], default: [] },
      newIssues: [{ type: String, trim: true }],
      wordDelta: { type: Number, default: 0 },
      encouragement: { type: String, trim: true, default: '' }
    },
    recommendation: {
      path: { type: String, enum: ['revise', 'notebook'] },
      reason: { type: String, trim: true, default: '' }
    },
    publish: {
      state: { type: String, enum: ['draft', 'published'], default: 'draft' },
      publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      publishedAt: { type: Date }
    },
    teacherEdits: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
      changedPaths: [{ type: String, trim: true }],
      note: { type: String, trim: true, default: '' }
    },
    aiOriginal: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

writingAssessmentSchema.index({ school: 1, draft: 1, kind: 1, createdAt: -1 });
writingAssessmentSchema.index({ school: 1, project: 1, kind: 1 });
writingAssessmentSchema.index({ school: 1, assignment: 1, 'publish.state': 1 });
// Two teachers clicking Assess must not spend the AI twice on the same draft.
writingAssessmentSchema.index(
  { school: 1, draft: 1, kind: 1 },
  { unique: true, partialFilterExpression: { aiStatus: { $in: ['pending', 'running'] } } }
);
writingAssessmentSchema.plugin(tenantIsolationPlugin);

const WritingAssessment = mongoose.model('WritingAssessment', writingAssessmentSchema);
export default WritingAssessment;
