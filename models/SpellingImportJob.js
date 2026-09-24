import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const spellingImportJobSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fileName: { type: String, trim: true, required: true },
    fileHash: { type: String, trim: true, required: true },
    status: { type: String, enum: ['preview', 'committed', 'failed'], default: 'preview' },
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
    errors: { type: [mongoose.Schema.Types.Mixed], default: [] },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    committedAt: { type: Date, default: null }
}, { timestamps: true, suppressReservedKeysWarning: true });

spellingImportJobSchema.index({ school: 1, createdAt: -1 });
spellingImportJobSchema.index({ school: 1, fileHash: 1, status: 1 });
spellingImportJobSchema.plugin(tenantIsolationPlugin);

const SpellingImportJob = mongoose.model('SpellingImportJob', spellingImportJobSchema);
export default SpellingImportJob;
