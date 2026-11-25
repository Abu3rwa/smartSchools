import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { SPELLING_CURRICULUM_GRADES } from '../utils/spellingProgress.js';

const projectionSchema = new mongoose.Schema({
    week: { type: Number, default: null },
    lastWordIndex: { type: Number, default: 0 },
    placementStartWeek: { type: Number, default: 1 },
    currentWeek: { type: Number, default: null },
    currentLastWordIndex: { type: Number, default: 0 },
    traversalRevision: { type: Number, default: 0 }
}, { _id: false });

const entrySchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    ledgerHash: { type: String, required: true },
    ledgerCount: { type: Number, required: true, min: 0 },
    insertedWordIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord' }],
        default: []
    },
    before: { type: projectionSchema, required: true },
    after: { type: projectionSchema, required: true },
    appliedAt: { type: Date, default: null }
}, { _id: false });

/**
 * One migration attempt per school and grade. The run keeps the exact ledger
 * rows it created and the Student projections before/after so verification and
 * rollback can compare hashes instead of trusting the current data.
 */
const spellingLibraryMigrationRunSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    grade: {
        type: String,
        enum: SPELLING_CURRICULUM_GRADES,
        required: true,
        uppercase: true
    },
    runId: { type: String, required: true, trim: true, maxlength: 80 },
    status: {
        type: String,
        enum: ['dry-run', 'applying', 'applied', 'blocked', 'failed', 'rolled-back'],
        required: true
    },
    planDigest: { type: String, default: null },
    counts: {
        students: { type: Number, default: 0 },
        existingLedger: { type: Number, default: 0 },
        fromAttempts: { type: Number, default: 0 },
        fromPosition: { type: Number, default: 0 },
        danglingResolved: { type: Number, default: 0 },
        danglingUnresolved: { type: Number, default: 0 },
        projectionsChanged: { type: Number, default: 0 }
    },
    entries: { type: [entrySchema], default: [] },
    unresolved: {
        type: [{
            _id: false,
            student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
            wordId: { type: mongoose.Schema.Types.ObjectId, default: null },
            reason: { type: String, required: true, maxlength: 200 }
        }],
        default: []
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

spellingLibraryMigrationRunSchema.index({ school: 1, grade: 1, runId: 1 }, { unique: true });
spellingLibraryMigrationRunSchema.index({ school: 1, grade: 1, status: 1, startedAt: -1 });
spellingLibraryMigrationRunSchema.plugin(tenantIsolationPlugin);

const SpellingLibraryMigrationRun = mongoose.model('SpellingLibraryMigrationRun', spellingLibraryMigrationRunSchema);
export default SpellingLibraryMigrationRun;
