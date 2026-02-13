import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const practiceSessionSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    assignment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StandardAssignment',
        required: true
    },
    standard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: true
    },
    sessionType: {
        type: String,
        enum: ['assessment', 'homework', 'classwork', 'practice'],
        default: 'practice'
    },
    questionLimit: {
        type: Number,
        min: 1,
        default: null
    },
    timeLimitSeconds: {
        type: Number,
        min: 60,
        default: null
    },
    allowedQuestionTypes: [{
        type: String,
        enum: ['multiple_choice', 'short_answer', 'true_false']
    }],
    allowedDifficulties: [{
        type: String,
        enum: ['easy', 'medium', 'hard']
    }],
    startedAt: {
        type: Date,
        default: Date.now
    },
    endedAt: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'expired'],
        default: 'active'
    },
    questionsAnswered: {
        type: Number,
        default: 0
    },
    correctCount: {
        type: Number,
        default: 0
    },
    lastActivityAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

practiceSessionSchema.index({ school: 1, student: 1, assignment: 1, status: 1 });
practiceSessionSchema.index({ school: 1, assignment: 1, createdAt: -1 });
practiceSessionSchema.index({ school: 1, student: 1, createdAt: -1 });

practiceSessionSchema.plugin(tenantIsolationPlugin);

const PracticeSession = mongoose.model('PracticeSession', practiceSessionSchema);
export default PracticeSession;
