import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const interventionTimelineSchema = new mongoose.Schema({
  type: { type: String, required: true },
  at: { type: Date, default: Date.now, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, trim: true },
}, { _id: false });

const interventionCaseSchema = new mongoose.Schema({
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
  status: {
    type: String,
    enum: ['open', 'acknowledged', 'in_progress', 'resolved', 'dismissed'],
    default: 'open',
    index: true,
  },
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low',
    index: true,
  },
  riskScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
    index: true,
  },
  signals: {
    incorrectStreak: { type: Number, min: 0, default: 0 },
    recentAccuracy: { type: Number, min: 0, max: 100, default: 0 },
    confidenceTrend: { type: String, enum: ['up', 'flat', 'down'], default: 'flat' },
    timeSinceLastSuccessDays: { type: Number, min: 0, default: 0 },
  },
  recommendedActions: { type: [String], default: [] },
  recentMistakes: { type: [String], default: [] },
  recentTopics: { type: [String], default: [] },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  timeline: {
    type: [interventionTimelineSchema],
    default: [],
  },
}, {
  timestamps: true,
});

interventionCaseSchema.index({ school: 1, status: 1, riskScore: -1 });
interventionCaseSchema.index({ school: 1, student: 1, standard: 1, status: 1 });

interventionCaseSchema.plugin(tenantIsolationPlugin);

const InterventionCase = mongoose.model('InterventionCase', interventionCaseSchema);
export default InterventionCase;
