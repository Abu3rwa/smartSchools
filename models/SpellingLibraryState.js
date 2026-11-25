import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { SPELLING_CURRICULUM_GRADES } from '../utils/spellingProgress.js';

/**
 * One coordination row per school and grade.
 *
 * `version` is the user-visible library revision: it increments once per
 * changed grade per successful mutation. `coordinationRevision` is touched by
 * session creation/scheduling/activation as well, so an edit and a test start
 * cannot both pass a read-only guard.
 */
const spellingLibraryStateSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    grade: {
        type: String,
        enum: SPELLING_CURRICULUM_GRADES,
        required: true,
        uppercase: true
    },
    version: { type: Number, default: 1, min: 1 },
    coordinationRevision: { type: Number, default: 0, min: 0 },
    progressSchemaVersion: { type: Number, default: 0, min: 0 },
    migrationStatus: {
        type: String,
        enum: ['ready', 'blocked'],
        default: 'ready'
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastChangeId: { type: String, default: null, trim: true, maxlength: 80 }
}, { timestamps: true });

spellingLibraryStateSchema.index({ school: 1, grade: 1 }, { unique: true });
spellingLibraryStateSchema.plugin(tenantIsolationPlugin);

const SpellingLibraryState = mongoose.model('SpellingLibraryState', spellingLibraryStateSchema);
export default SpellingLibraryState;
