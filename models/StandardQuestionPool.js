import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const optionSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    text: { type: String, trim: true },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true, trim: true },
    questionType: {
      type: String,
      enum: ['multiple_choice', 'short_answer', 'true_false'],
      required: true,
    },
    options: [optionSchema],
    correctAnswer: { type: String, required: true, trim: true },
    explanation: { type: String, trim: true, default: '' },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
  },
  { _id: true }
);

const editHistorySchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, min: 1 },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    editedAt: { type: Date, default: Date.now },
    changeSummary: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const standardQuestionPoolSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StandardAssignment',
      required: true,
    },
    standard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Standard',
      required: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    generatedQuestionCount: {
      type: Number,
      min: 1,
      max: 100,
      required: true,
    },
    generationLanguages: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    currentVersion: {
      type: Number,
      min: 1,
      default: 1,
    },
    status: {
      type: String,
      enum: ['draft', 'reviewed', 'approved', 'published'],
      default: 'draft',
    },
    questions: [questionSchema],
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: { type: Date, default: null },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    publishedAt: { type: Date, default: null },
    editHistory: [editHistorySchema],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

standardQuestionPoolSchema.index({ school: 1, assignment: 1 }, { unique: true });
standardQuestionPoolSchema.index({ school: 1, assignment: 1, status: 1 });
standardQuestionPoolSchema.index({ school: 1, class: 1, subject: 1, standard: 1, status: 1 });

standardQuestionPoolSchema.plugin(tenantIsolationPlugin);

const StandardQuestionPool = mongoose.model('StandardQuestionPool', standardQuestionPoolSchema);
export default StandardQuestionPool;
