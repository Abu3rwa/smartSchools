import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * Persisted mastery state per student per standard.
 * Supports sticky mastery, decay/review, and lifetime stats.
 */
const masteryRecordSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: [true, 'Student is required']
    },
    standard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: [true, 'Standard is required']
    },
    // Persisted mastery
    isMastered: {
        type: Boolean,
        default: false
    },
    masteredAt: {
        type: Date,
        default: null
    },
    // Lifetime counts (denormalized for quick display)
    totalAttemptsAllTime: {
        type: Number,
        default: 0
    },
    totalCorrectAllTime: {
        type: Number,
        default: 0
    },
    // Current streak of correct answers (from most recent attempts)
    currentStreak: {
        type: Number,
        default: 0
    },
    bestStreak: {
        type: Number,
        default: 0
    },
    // Highest difficulty level the student has passed (for adaptive progression)
    highestDifficultyPassed: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: null
    },
    lastPracticedAt: {
        type: Date,
        default: null
    },
    // Decay / review: if true, student was mastered but needs to practice again
    needsReview: {
        type: Boolean,
        default: false
    },
    reviewSuggestedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

masteryRecordSchema.index({ school: 1, student: 1, standard: 1 }, { unique: true });
masteryRecordSchema.index({ school: 1, student: 1 });
masteryRecordSchema.index({ school: 1, standard: 1 });

masteryRecordSchema.plugin(tenantIsolationPlugin);

const MasteryRecord = mongoose.model('MasteryRecord', masteryRecordSchema);
export default MasteryRecord;
