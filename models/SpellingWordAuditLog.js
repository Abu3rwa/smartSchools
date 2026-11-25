import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const wordValueSchema = new mongoose.Schema({
    grade: { type: String, default: null },
    week: { type: Number, default: null },
    category: { type: String, default: null },
    word: { type: String, default: null },
    definition: { type: String, default: null },
    order: { type: Number, default: null },
    revision: { type: Number, default: null },
    deletedAt: { type: Date, default: null }
}, { _id: false });

const wordChangeSchema = new mongoose.Schema({
    wordId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingWord', required: true },
    changeType: {
        type: String,
        enum: ['add', 'patch', 'archive', 'reorder', 'move', 'import', 'typo'],
        required: true
    },
    before: { type: wordValueSchema, default: null },
    after: { type: wordValueSchema, default: null }
}, { _id: false });

const versionPairSchema = new mongoose.Schema({
    grade: { type: String, required: true, uppercase: true },
    version: { type: Number, required: true, min: 1 }
}, { _id: false });

/**
 * One immutable record per library operation. It is written inside the same
 * transaction as the words it describes, so a mutation cannot succeed without
 * its audit record.
 */
const spellingWordAuditLogSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    operationId: { type: String, required: true, trim: true, maxlength: 80 },
    requestHash: { type: String, required: true, trim: true, maxlength: 128 },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: null, trim: true, maxlength: 40 },
    at: { type: Date, default: Date.now, required: true },
    reason: { type: String, required: true, trim: true, minlength: 5, maxlength: 500 },
    source: {
        type: String,
        enum: ['single', 'bulk', 'import', 'migration', 'correction'],
        required: true
    },
    importId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingImportJob', default: null },
    action: { type: String, required: true, trim: true, maxlength: 40 },
    libraryVersionsBefore: { type: [versionPairSchema], default: [] },
    libraryVersionsAfter: { type: [versionPairSchema], default: [] },
    changes: { type: [wordChangeSchema], default: [] },
    impact: { type: mongoose.Schema.Types.Mixed, default: null },
    previewDigest: { type: String, default: null, trim: true, maxlength: 128 },
    result: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

spellingWordAuditLogSchema.index({ school: 1, operationId: 1 }, { unique: true });
spellingWordAuditLogSchema.index({ school: 1, 'changes.wordId': 1, createdAt: -1, _id: -1 });
spellingWordAuditLogSchema.index({ school: 1, 'libraryVersionsAfter.grade': 1, createdAt: -1 });
spellingWordAuditLogSchema.plugin(tenantIsolationPlugin);

const SpellingWordAuditLog = mongoose.model('SpellingWordAuditLog', spellingWordAuditLogSchema);
export default SpellingWordAuditLog;
