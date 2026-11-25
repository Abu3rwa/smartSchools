import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { SPELLING_CURRICULUM_GRADES } from '../utils/spellingProgress.js';

/**
 * One consumed curriculum identity per student and word.
 *
 * "Consumed" means the word was traversed in curriculum order, not that the
 * student mastered it: an incorrect or skipped original answer still consumes
 * the identity. Retests remain responsible for mastery. Keeping identities in
 * their own collection avoids an ever-growing array on Student.
 */
const spellingWordProgressSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    wordId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', required: true },
    grade: { type: String, enum: SPELLING_CURRICULUM_GRADES, required: true, uppercase: true },
    consumedAt: { type: Date, default: Date.now, required: true },
    source: {
        type: String,
        enum: ['attempt', 'legacy-position', 'historical-attempt', 'placement'],
        required: true
    },
    sourceSession: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', default: null },
    sourceAttempt: { type: mongoose.Schema.Types.ObjectId, default: null },
    migrationRunId: { type: String, default: null, trim: true, maxlength: 80 }
}, { timestamps: true });

spellingWordProgressSchema.index({ school: 1, student: 1, wordId: 1 }, { unique: true });
spellingWordProgressSchema.index({ school: 1, student: 1, grade: 1, wordId: 1 });
spellingWordProgressSchema.plugin(tenantIsolationPlugin);

const SpellingWordProgress = mongoose.model('SpellingWordProgress', spellingWordProgressSchema);
export default SpellingWordProgress;
