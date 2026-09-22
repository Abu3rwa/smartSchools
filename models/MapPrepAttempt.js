import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const mapPrepAttemptSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepQuiz', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepPlan', required: true },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
    status: { type: String, enum: ['in_progress', 'submitted', 'graded'], default: 'in_progress' },
    answers: [{
        questionId: mongoose.Schema.Types.ObjectId,
        answer: String,
        isCorrect: { type: Boolean, default: null },
        gradingStatus: { type: String, enum: ['objective_graded', 'pending_teacher_review', 'graded'], default: 'pending_teacher_review' },
        gradingSource: { type: String, enum: ['deterministic', 'teacher', 'ai_accepted', 'teacher_override'], default: null },
        aiSuggestion: { type: mongoose.Schema.Types.Mixed, default: null },
        teacherGrade: { type: mongoose.Schema.Types.Mixed, default: null }
    }]
}, { timestamps: true });

mapPrepAttemptSchema.index({ school: 1, quiz: 1, student: 1 }, { unique: true });
mapPrepAttemptSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPrepAttempt', mapPrepAttemptSchema);
