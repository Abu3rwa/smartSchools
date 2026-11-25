import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const retestStateSchema = new mongoose.Schema({
    status: { type: String, default: null },
    correctRetestStreak: { type: Number, default: null },
    incorrectRetestCount: { type: Number, default: null },
    dueAt: { type: Date, default: null },
    lastRetestedAt: { type: Date, default: null },
    practiceMasteredAt: { type: Date, default: null },
    practiceMasteredBySession: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBySession: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', default: null },
    suppressedAt: { type: Date, default: null },
    wordSnapshot: { type: String, default: null },
    wordRevision: { type: Number, default: null }
}, { _id: false });

/**
 * Immutable provenance for one student/source-word retest group. Correction
 * replay reads these events in sequence; a later scheduler change is recorded
 * as its own event so replay cannot erase it.
 */
const spellingRetestEventSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    sourceWord: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', required: true },
    sequence: { type: Number, required: true, min: 1 },
    kind: {
        // `correction` is derived from replay and is skipped when replaying;
        // every other kind is an input replayed in sequence.
        type: String,
        enum: ['baseline', 'answer', 'teacher-override', 'schedule', 'legacy-practice-migration', 'typo', 'correction'],
        required: true
    },
    // The answer inputs a replay needs. Legacy events lack this and cannot be
    // replayed safely.
    outcome: {
        correct: { type: Boolean, default: null },
        skipped: { type: Boolean, default: null },
        formalTest: { type: Boolean, default: null }
    },
    before: { type: retestStateSchema, default: null },
    after: { type: retestStateSchema, default: null },
    retestItemIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SpellingRetestItem' }],
        default: []
    },
    sourceSession: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', default: null },
    sourceAttempt: { type: mongoose.Schema.Types.ObjectId, default: null },
    operationId: { type: String, default: null, trim: true, maxlength: 80 },
    policyVersion: { type: Number, default: 1, min: 1 },
    occurredAt: { type: Date, required: true }
}, { timestamps: true });

spellingRetestEventSchema.index(
    { school: 1, student: 1, sourceWord: 1, sequence: 1 },
    { unique: true }
);
spellingRetestEventSchema.index({ school: 1, student: 1, sourceWord: 1, occurredAt: 1 });
spellingRetestEventSchema.plugin(tenantIsolationPlugin);

const SpellingRetestEvent = mongoose.model('SpellingRetestEvent', spellingRetestEventSchema);
export default SpellingRetestEvent;
