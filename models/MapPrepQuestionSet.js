import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const optionSchema = new mongoose.Schema({ label: String, text: String }, { _id: false });
const questionSchema = new mongoose.Schema({
    questionText: { type: String, required: true, trim: true },
    questionType: { type: String, enum: ['true_false', 'multiple_choice', 'short_answer'], required: true },
    options: [optionSchema],
    correctAnswer: { type: String, default: null },
    explanation: { type: String, default: '' },
    skillCode: { type: String, default: '' },
    skillName: { type: String, default: '' },
    domain: { type: String, default: '' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    teacherEdited: { type: Boolean, default: false },
    displayOrder: { type: Number, required: true }
}, { _id: true });

const mapPrepQuestionSetSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepPlan', required: true },
    round: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepRound', required: true },
    version: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['draft', 'teacher_review', 'approved', 'published', 'retired'], default: 'draft' },
    generatedFromAnalysisId: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepAnalysis', default: null },
    targetSkillIds: [{ type: String }],
    targetStandardIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Standard' }],
    questions: [questionSchema],
    generationModel: { type: String, default: null },
    promptVersion: { type: String, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null }
}, { timestamps: true });

mapPrepQuestionSetSchema.index({ school: 1, plan: 1, round: 1, version: 1 }, { unique: true });
mapPrepQuestionSetSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPrepQuestionSet', mapPrepQuestionSetSchema);
