import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const questionSnapshotSchema = new mongoose.Schema(
  {
    originalQuestionId: { type: mongoose.Schema.Types.ObjectId },
    instruction: { type: String, trim: true, default: '' },
    questionText: { type: String, required: true, trim: true },
    questionType: {
      type: String,
      enum: ['multiple_choice', 'short_answer', 'true_false'],
      required: true,
    },
    options: [
      {
        label: { type: String, trim: true },
        text: { type: String, trim: true },
        _id: false,
      },
    ],
    correctAnswer: { type: String, required: true, trim: true },
    explanation: { type: String, trim: true, default: '' },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    scoringWeight: { type: Number, default: 1, min: 0 },
    acceptableAnswers: { type: [String], default: [] },
    evaluationCriteria: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const assessmentRevisionSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StandardAssignment',
      required: [true, 'Assignment is required'],
    },
    versionNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    contentSnapshot: {
      title: { type: String, trim: true },
      instructions: { type: String, trim: true },
      dueDate: { type: Date },
      questions: [questionSnapshotSchema],
    },
    changeSummary: {
      type: String,
      trim: true,
      default: '',
    },
    changeType: {
      type: String,
      enum: ['metadata', 'content', 'questions_added', 'questions_removed', 'questions_reordered', 'mixed'],
      default: 'content',
    },
    publishStatus: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
    },
    revisionPolicy: {
      type: String,
      enum: ['not-started-only', 'not-started-and-in-progress', 'all-future-attempts'],
      default: 'not-started-only',
    },
    effectiveFrom: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    publishedAt: { type: Date, default: null },
    impactSnapshot: {
      completedStudents: { type: Number, default: 0 },
      inProgressStudents: { type: Number, default: 0 },
      notStartedStudents: { type: Number, default: 0 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

assessmentRevisionSchema.index(
  { school: 1, assignment: 1, versionNumber: 1 },
  { unique: true }
);
assessmentRevisionSchema.index({ school: 1, assignment: 1, publishStatus: 1 });

assessmentRevisionSchema.plugin(tenantIsolationPlugin);

const AssessmentRevision = mongoose.model('AssessmentRevision', assessmentRevisionSchema);
export default AssessmentRevision;
