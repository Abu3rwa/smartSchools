import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const spellingRetestItemSchema = new mongoose.Schema({
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
    sourceWord: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SpellingWord',
        required: true
    },
    wordSnapshot: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    grade: {
        type: String,
        enum: ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'],
        required: true,
        uppercase: true
    },
    week: {
        type: Number,
        required: true,
        min: 1
    },
    category: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    sourceSession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SpellingSession',
        required: true
    },
    sourceAttempt: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    flaggedAt: {
        type: Date,
        default: Date.now
    },
    lastRetestedAt: {
        type: Date,
        default: null
    },
    correctRetestStreak: {
        type: Number,
        default: 0,
        min: 0
    },
    incorrectRetestCount: {
        type: Number,
        default: 0,
        min: 0
    },
    dueAt: {
        type: Date,
        required: true
    },
    wordRevision: { type: Number, default: 1, min: 1 },
    revision: { type: Number, default: 1, min: 1 },
    lastEventSequence: { type: Number, default: 0, min: 0 },
    // Retained as provenance when the originating miss is explicitly undone;
    // excluded from obligation queries rather than falsely marked resolved.
    suppressedAt: { type: Date, default: null },
    suppressedByCorrection: { type: String, default: null, trim: true, maxlength: 80 },
    status: {
        type: String,
        enum: ['pending', 'practice-mastered', 'resolved', 'expired'],
        default: 'pending'
    },
    practiceMasteredAt: {
        type: Date,
        default: null
    },
    practiceMasteredBySession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SpellingSession',
        default: null
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    resolvedBySession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SpellingSession',
        default: null
    }
}, {
    timestamps: true
});

spellingRetestItemSchema.index({ school: 1, student: 1, status: 1, flaggedAt: 1 });
spellingRetestItemSchema.index({ school: 1, student: 1, dueAt: 1, status: 1 });
spellingRetestItemSchema.index(
    { status: 1, dueAt: 1 },
    { name: 'spelling_retest_due_queue' }
);
spellingRetestItemSchema.index(
    { school: 1, student: 1, wordSnapshot: 1 },
    {
        unique: true,
        partialFilterExpression: { status: 'pending', suppressedAt: null }
    }
);
spellingRetestItemSchema.plugin(tenantIsolationPlugin);

const SpellingRetestItem = mongoose.model('SpellingRetestItem', spellingRetestItemSchema);
export default SpellingRetestItem;
