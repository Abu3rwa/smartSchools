import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const mapPrepRoundSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepPlan', required: true },
    previousRound: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepRound', default: null },
    sourceMapTestRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'MapTestRecord', required: true },
    analysisSnapshot: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepAnalysis', default: null },
    roundNumber: { type: Number, required: true, min: 1 },
    sourceAttemptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepAttempt' }],
    targetSkillIds: [{ type: String }],
    targetStandardIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Standard' }],
    masteredSkillIds: [{ type: String }],
    needsPracticeSkillIds: [{ type: String }],
    pendingReviewCount: { type: Number, default: 0, min: 0 },
    analysis: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['draft', 'teacher_review', 'approved', 'published', 'completed'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    completedAt: { type: Date, default: null }
}, { timestamps: true });

mapPrepRoundSchema.index({ school: 1, plan: 1, roundNumber: 1 }, { unique: true });
mapPrepRoundSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPrepRound', mapPrepRoundSchema);
