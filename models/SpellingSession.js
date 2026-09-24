import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { DEFAULT_SPELLING_EMAIL_AUDIENCE, SPELLING_EMAIL_AUDIENCES } from '../utils/spellingEmailSettings.js';

const spellingAttemptSchema = new mongoose.Schema({
    sequence: { type: Number, required: true, min: 1 },
    wordId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', required: true },
    wordSnapshot: { type: String, required: true, trim: true, maxlength: 200 },
    grade: { type: String, required: true, uppercase: true },
    week: { type: Number, required: true, min: 1 },
    category: { type: String, required: true, trim: true, maxlength: 120 },
    retestItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingRetestItem', default: null },
    isRetest: { type: Boolean, default: false },
    correct: { type: Boolean, required: true },
    studentInput: { type: String, default: null, maxlength: 200 },
    normalizedInput: { type: String, default: null, maxlength: 200 },
    answeredAt: { type: Date, default: Date.now },
    answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 160 }
}, { _id: true, id: false });

const spellingSessionSchema = new mongoose.Schema({
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
    mode: {
        type: String,
        enum: ['teacher-led', 'self-serve'],
        required: true
    },
    status: {
        type: String,
        enum: ['in-progress', 'completed', 'abandoned'],
        default: 'in-progress'
    },
    maxMistakesAllowed: {
        type: Number,
        required: true,
        min: 1
    },
    retestDeadline: {
        type: Date,
        required: true
    },
    curriculumGrade: {
        type: String,
        enum: ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'],
        default: null
    },
    curriculumWeek: {
        type: Number,
        min: 1,
        default: null
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    administeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    emailNotification: {
        type: String,
        enum: SPELLING_EMAIL_AUDIENCES,
        default: DEFAULT_SPELLING_EMAIL_AUDIENCE
    },
    completionReason: {
        type: String,
        enum: ['mistake-limit', 'curriculum-exhausted', 'teacher-ended', 'manual-complete'],
        default: null
    },
    nextSequence: {
        type: Number,
        default: 1,
        min: 1
    },
    currentItem: {
        wordId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', default: null },
        retestItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingRetestItem', default: null },
        sequence: { type: Number, default: null, min: 1 }
    },
    correctCount: {
        type: Number,
        default: 0,
        min: 0
    },
    mistakeCount: {
        type: Number,
        default: 0,
        min: 0
    },
    emailStatus: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'not-applicable'],
        default: 'pending'
    },
    emailSentAt: {
        type: Date,
        default: null
    },
    emailAttempts: {
        type: Number,
        default: 0,
        min: 0
    },
    emailError: {
        type: String,
        default: null
    },
    attempts: {
        type: [spellingAttemptSchema],
        default: []
    }
}, {
    timestamps: true
});

spellingSessionSchema.index({ school: 1, student: 1, status: 1, startedAt: -1 });
spellingSessionSchema.index({ school: 1, createdAt: -1 });
spellingSessionSchema.plugin(tenantIsolationPlugin);

const SpellingSession = mongoose.model('SpellingSession', spellingSessionSchema);
export default SpellingSession;
