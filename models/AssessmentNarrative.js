import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const assessmentNarrativeSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'Subject is required'],
    },
    gradeLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    selectedStandardIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: true,
      },
    ],
    evidenceHash: {
      type: String,
      trim: true,
      default: '',
    },
    evidenceSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    aiDraftText: {
      type: String,
      trim: true,
      default: '',
    },
    teacherEditedText: {
      type: String,
      trim: true,
      default: null,
    },
    finalApprovedText: {
      type: String,
      trim: true,
      default: null,
    },
    language: {
      type: String,
      default: 'en',
    },
    toneProfile: {
      type: String,
      enum: ['supportive', 'neutral', 'formal'],
      default: 'supportive',
    },
    status: {
      type: String,
      enum: ['draft', 'approved', 'sent', 'expired'],
      default: 'draft',
    },
    createdByTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedAt: { type: Date, default: null },
    approvedByTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sentAt: { type: Date, default: null },
    sentToStudent: { type: Boolean, default: false },
    sentToParent: { type: Boolean, default: false },
    attachedProgressTable: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    editDriftPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    tokenUsage: {
      inputTokenCount: { type: Number, default: 0 },
      outputTokenCount: { type: Number, default: 0 },
      totalTokenCount: { type: Number, default: 0 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

assessmentNarrativeSchema.index({ school: 1, student: 1, status: 1 });
assessmentNarrativeSchema.index({ school: 1, createdByTeacherId: 1, createdAt: -1 });
assessmentNarrativeSchema.index({ school: 1, class: 1, subject: 1, status: 1 });
assessmentNarrativeSchema.index({ school: 1, status: 1, expiresAt: 1 });

assessmentNarrativeSchema.plugin(tenantIsolationPlugin);

const AssessmentNarrative = mongoose.model('AssessmentNarrative', assessmentNarrativeSchema);
export default AssessmentNarrative;
