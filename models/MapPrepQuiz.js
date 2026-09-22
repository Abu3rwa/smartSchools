import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const quizQuestionSchema = new mongoose.Schema({
    sourceQuestionId: mongoose.Schema.Types.ObjectId,
    questionText: String,
    questionType: { type: String, enum: ['true_false', 'multiple_choice', 'short_answer'] },
    options: [{ label: String, text: String }],
    correctAnswer: String,
    explanation: String,
    skillCode: String,
    skillName: String,
    domain: String,
    displayOrder: Number
}, { _id: true });

const mapPrepQuizSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepPlan', required: true },
    round: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepRound', required: true },
    questionSet: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepQuestionSet', required: true },
    title: { type: String, required: true },
    instructions: { type: String, default: '' },
    questions: [quizQuestionSchema],
    questionCount: { type: Number, required: true, min: 1 },
    timeLimitSeconds: { type: Number, default: null },
    status: { type: String, enum: ['draft', 'active', 'closed', 'archived'], default: 'draft' },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null }
}, { timestamps: true });

mapPrepQuizSchema.index({ school: 1, plan: 1, round: 1 });
mapPrepQuizSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPrepQuiz', mapPrepQuizSchema);
