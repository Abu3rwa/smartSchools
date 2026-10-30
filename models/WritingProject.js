import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { WRITING_STAGES, NOTEBOOK_STATES } from '../constants/writingPresets.js';

const workingSectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    index: { type: Number, default: 0 },
    text: { type: String, default: '' }
  },
  { _id: false }
);

/**
 * One revision task followed across drafts. `stalled` means the same task was
 * checked and not done on two comparisons in a row; the teacher sees it and the
 * next feedback changes its approach instead of repeating itself.
 */
const revisionLedgerSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    text: { type: String, trim: true, default: '' },
    introducedDraft: { type: Number, min: 0 },
    lastCheckedDraft: { type: Number, min: 0 },
    resolvedDraft: { type: Number, min: 0 },
    checks: { type: Number, min: 0, default: 0 },
    unresolvedStreak: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['open', 'resolved', 'stalled', 'dropped'], default: 'open' },
    note: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

/**
 * One student's work on one writing assignment. Holds the live autosave;
 * submitted versions live in WritingDraft so nothing typed after a submission
 * can damage the version the teacher assessed.
 */
const writingProjectSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingAssignment', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    academicYear: { type: String, trim: true },
    stage: { type: String, enum: WRITING_STAGES, default: 'not_started' },
    status: {
      type: String,
      enum: ['in_progress', 'ready_for_final', 'needs_revision', 'completed'],
      default: 'in_progress'
    },
    draftCount: { type: Number, default: 0, min: 0 },
    latestDraft: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingDraft' },
    latestAssessment: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingAssessment' },
    revisionLedger: { type: [revisionLedgerSchema], default: [] },
    autosave: {
      title: { type: String, trim: true, default: '' },
      sections: { type: [workingSectionSchema], default: [] },
      updatedAt: { type: Date }
    },
    wordCount: { type: Number, default: 0 },
    firstOpenedAt: { type: Date },
    lastEditedAt: { type: Date },
    notebook: {
      state: { type: String, enum: NOTEBOOK_STATES, default: 'not_requested' },
      requestedAt: { type: Date },
      checkedAt: { type: Date },
      checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      teacherNote: { type: String, trim: true, default: '' },
      finalScore: { type: Number, min: 0, max: 1000 }
    },
    teacherOverride: {
      setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
      reason: { type: String, trim: true, default: '' },
      stageLockedTo: { type: String, enum: WRITING_STAGES }
    }
  },
  { timestamps: true }
);

writingProjectSchema.index({ school: 1, assignment: 1, student: 1 }, { unique: true });
writingProjectSchema.index({ school: 1, student: 1, stage: 1 });
writingProjectSchema.index({ school: 1, assignment: 1, stage: 1 });
writingProjectSchema.plugin(tenantIsolationPlugin);

const WritingProject = mongoose.model('WritingProject', writingProjectSchema);
export default WritingProject;
