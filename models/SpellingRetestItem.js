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
    dueAt: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'resolved', 'expired'],
        default: 'pending'
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
    { school: 1, student: 1, wordSnapshot: 1 },
    { unique: true, partialFilterExpression: { status: 'pending' } }
);
spellingRetestItemSchema.plugin(tenantIsolationPlugin);

const SpellingRetestItem = mongoose.model('SpellingRetestItem', spellingRetestItemSchema);
export default SpellingRetestItem;
