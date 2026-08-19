import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const traitScoresSchema = new mongoose.Schema({
    coreTrait: { type: Number, min: 0, max: 5, default: 0 },
    secondaryTrait1: { type: Number, min: 0, max: 5, default: 0 },
    secondaryTrait2: { type: Number, min: 0, max: 5, default: 0 },
    secondaryTrait3: { type: Number, min: 0, max: 5, default: 0 },
}, { _id: false });

const traitScoreEntrySchema = new mongoose.Schema({
    score: { type: Number, min: 0, max: 5, default: null },
    scoreSource: { type: String, enum: ['ai_suggested', 'teacher_override', 'teacher_manual', null], default: null },
    aiSuggestedScore: { type: Number, min: 0, max: 5, default: null },
    overrideReason: { type: String, default: '' },
}, { _id: false });

const plpStudentRecordSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYear: { type: String, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    theme: { type: String, enum: ['confidence', 'hope', 'wisdom'], required: true },
    focusTrait: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpTraitConfig', default: null },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    scores: { type: traitScoresSchema, default: () => ({}) },
    traitScoreEntries: { type: Map, of: traitScoreEntrySchema, default: () => ({}) },
    weightedScore: { type: Number, default: 0 },
    level: { type: String, enum: ['emerging', 'developing', 'strong'], default: 'emerging' },
    evidenceCount: { type: Number, default: 0 },
    recommendedActivities: [{ type: String }],
    awardCandidate: { type: Boolean, default: false },
    awardDecision: { type: String, enum: ['none', 'selected', 'not_selected'], default: 'none' },
    awardDecisionReason: { type: String, default: '' },
    status: { type: String, enum: ['in_progress', 'submitted', 'locked'], default: 'in_progress' },
    submittedAt: { type: Date },
}, { timestamps: true });

plpStudentRecordSchema.plugin(tenantIsolationPlugin);
plpStudentRecordSchema.index({ school: 1, academicYear: 1, month: 1, teacher: 1, student: 1 }, { unique: true });
plpStudentRecordSchema.index({ school: 1, academicYear: 1, month: 1, class: 1 });

export default mongoose.model('PlpStudentRecord', plpStudentRecordSchema);
