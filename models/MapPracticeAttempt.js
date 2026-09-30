import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const answerSchema = new mongoose.Schema({
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeQuestion', required: true },
    questionId: { type: String, default: '', trim: true, maxlength: 180 },
    response: { type: mongoose.Schema.Types.Mixed, default: null },
    isCorrect: { type: Boolean, default: null },
    autoGraded: { type: Boolean, default: false },
    teacherOverride: { type: Boolean, default: false },
    teacherComment: { type: String, default: '', trim: true, maxlength: 2000 },
    timeSpentSeconds: { type: Number, default: 0, min: 0 },
    flagged: { type: Boolean, default: false },
    questionSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    correctAnswerSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    explanationSnapshot: { type: String, default: '', trim: true, maxlength: 4000 }
}, { _id: true });

const mapPracticeAttemptSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticePlan', required: true },
    set: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeSet', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeAssignment', default: null },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
    timeSpentSeconds: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['in_progress', 'submitted', 'reviewed'], default: 'in_progress' },
    score: { type: Number, default: 0, min: 0 },
    maxScore: { type: Number, default: 0, min: 0 },
    reviewStatus: { type: String, enum: ['pending', 'needs_teacher', 'reviewed'], default: 'pending' },
    answers: [answerSchema],
    teacherComment: { type: String, default: '', trim: true, maxlength: 4000 },
    savedAt: { type: Date, default: Date.now }
}, { timestamps: true });

mapPracticeAttemptSchema.index({ school: 1, student: 1, set: 1 }, { unique: true });
mapPracticeAttemptSchema.index({ school: 1, student: 1, submittedAt: -1 });
mapPracticeAttemptSchema.index({ school: 1, plan: 1, reviewStatus: 1, submittedAt: -1 });
mapPracticeAttemptSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPracticeAttempt', mapPracticeAttemptSchema);
