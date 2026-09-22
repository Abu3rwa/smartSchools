import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const evidenceSchema = new mongoose.Schema({
    mapEvidenceId: { type: String, required: true },
    instructionalArea: { type: String, required: true, trim: true },
    standardCode: { type: String, default: '' },
    standardDescription: { type: String, default: '' },
    performanceLevel: { type: String, default: '' }
}, { _id: false });

const sourceEvidenceSchema = new mongoose.Schema({
    mapEvidenceId: { type: String, required: true },
    instructionalArea: { type: String, required: true, trim: true },
    standardCode: { type: String, default: '' },
    standardDescription: { type: String, default: '' },
    performanceLevel: { type: String, default: '' }
}, { _id: false });

const topicGroupSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['priority', 'strength', 'mixed'], required: true },
    sourceEvidenceIds: { type: [String], required: true },
    sourceEvidence: { type: [sourceEvidenceSchema], required: true },
    skillCount: { type: Number, required: true, min: 0 },
    scoreBandRange: { type: String, default: '' },
    evidenceSummary: { type: String, required: true },
    confidence: { type: String, enum: ['low', 'medium', 'high'], required: true }
}, { _id: true });

const mapPrepAnalysisSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepPlan', required: true },
    mapTestRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'MapTestRecord', required: true },
    round: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepRound', default: null },
    version: { type: Number, required: true, min: 1 },
    sourceEvidence: { type: [evidenceSchema], required: true },
    topicGroups: { type: [topicGroupSchema], default: [] },
    strengths: [{ type: String }],
    needsPracticeSkills: [{ type: String }],
    masteredSkills: [{ type: String }],
    recommendedSkills: [{ type: String }],
    evidenceSummary: { type: String, default: '' },
    limitations: [{ type: String }],
    status: { type: String, enum: ['draft', 'approved', 'rejected', 'failed'], default: 'draft' },
    validationError: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null }
}, { timestamps: true });

mapPrepAnalysisSchema.index({ school: 1, plan: 1, version: 1 }, { unique: true });
mapPrepAnalysisSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPrepAnalysis', mapPrepAnalysisSchema);
