import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const reviewTaskSchema = new mongoose.Schema({
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true,
  },
  standard: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Standard',
    required: true,
    index: true,
  },
  assignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StandardAssignment',
    default: null,
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    default: null,
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    default: null,
  },
  sourceAttemptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PracticeAttempt',
    default: null,
  },
  sourceReason: {
    type: String,
    enum: ['incorrect_answer', 'low_confidence', 'decay_check', 'teacher_assigned'],
    default: 'incorrect_answer',
    required: true,
  },
  topicTags: {
    type: [String],
    default: [],
  },
  scheduledFor: {
    type: Date,
    required: true,
    index: true,
  },
  dueBy: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'expired', 'canceled'],
    default: 'scheduled',
    index: true,
  },
  intervalStage: {
    type: Number,
    min: 1,
    default: 1,
    required: true,
  },
  intervalDays: {
    type: Number,
    min: 1,
    default: 1,
    required: true,
  },
  priorityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 50,
    index: true,
  },
  completion: {
    completedAt: { type: Date, default: null },
    accuracyAtCompletion: { type: Number, min: 0, max: 100, default: null },
    attemptCount: { type: Number, min: 0, default: 0 },
  },
}, {
  timestamps: true,
});

reviewTaskSchema.index({ school: 1, student: 1, status: 1, scheduledFor: 1 });
reviewTaskSchema.index({ school: 1, standard: 1, status: 1 });
reviewTaskSchema.index({ school: 1, priorityScore: -1, status: 1 });
reviewTaskSchema.index(
  { school: 1, student: 1, standard: 1, intervalStage: 1, status: 1 },
  {
    partialFilterExpression: {
      status: { $in: ['scheduled', 'in_progress'] },
    },
  }
);

reviewTaskSchema.plugin(tenantIsolationPlugin);

const ReviewTask = mongoose.model('ReviewTask', reviewTaskSchema);
export default ReviewTask;
