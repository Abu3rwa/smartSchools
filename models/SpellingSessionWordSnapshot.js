import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * Immutable practice content captured when a curriculum session is created or
 * scheduled. Serving, dictation and grading read these rows, so a library edit
 * can never change what a running test asks. Retest text stays frozen on the
 * retest obligation itself; formal membership stays on the session array.
 */
const spellingSessionWordSnapshotSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', required: true },
    wordId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', required: true },
    word: { type: String, required: true, trim: true, maxlength: 200 },
    normalizedWord: { type: String, required: true, trim: true, maxlength: 200 },
    definition: { type: String, default: '', trim: true, maxlength: 2000 },
    grade: { type: String, required: true, uppercase: true },
    week: { type: Number, required: true, min: 1 },
    category: { type: String, required: true, trim: true, maxlength: 120 },
    order: { type: Number, required: true, min: 1 },
    wordRevision: { type: Number, default: 1, min: 1 },
    libraryVersion: { type: Number, default: null, min: 1 },
    retestItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingRetestItem', default: null },
    isRetest: { type: Boolean, default: false }
}, { timestamps: true });

spellingSessionWordSnapshotSchema.index({ school: 1, session: 1, wordId: 1 }, { unique: true });
spellingSessionWordSnapshotSchema.index({ school: 1, session: 1, grade: 1, week: 1, order: 1 });
spellingSessionWordSnapshotSchema.plugin(tenantIsolationPlugin);

const SpellingSessionWordSnapshot = mongoose.model('SpellingSessionWordSnapshot', spellingSessionWordSnapshotSchema);
export default SpellingSessionWordSnapshot;
