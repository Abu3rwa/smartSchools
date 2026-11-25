import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const spellingImportJobSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fileName: { type: String, trim: true, required: true },
    fileHash: { type: String, trim: true, required: true },
    status: { type: String, enum: ['preview', 'committed', 'failed'], default: 'preview' },
    mode: { type: String, enum: ['merge', 'replace'], default: 'merge' },
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
    errors: { type: [mongoose.Schema.Types.Mixed], default: [] },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    identityMappings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    identityMappingDigest: { type: String, default: null, trim: true, maxlength: 128 },
    expectedLibraryVersions: { type: mongoose.Schema.Types.Mixed, default: {} },
    previewDigest: { type: String, default: null, trim: true, maxlength: 128 },
    expiresAt: { type: Date, default: null },
    committedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    committedAt: { type: Date, default: null }
}, { timestamps: true, suppressReservedKeysWarning: true });

spellingImportJobSchema.index({ school: 1, createdAt: -1 });
spellingImportJobSchema.index({ school: 1, fileHash: 1, status: 1 });
spellingImportJobSchema.plugin(tenantIsolationPlugin);

const SpellingImportJob = mongoose.model('SpellingImportJob', spellingImportJobSchema);
export default SpellingImportJob;
