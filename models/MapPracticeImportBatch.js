import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const fileSummarySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 240 },
    fileHash: { type: String, default: '', trim: true, maxlength: 64 },
    studentId: { type: String, default: '', trim: true, maxlength: 80 },
    studentName: { type: String, default: '', trim: true, maxlength: 180 },
    studentMongoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    sourceStudentId: { type: String, default: '', trim: true, maxlength: 80 },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticePlan', default: null },
    firstSetId: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeSet', default: null },
    rows: { type: Number, default: 0, min: 0 },
    created: { type: Number, default: 0, min: 0 },
    updated: { type: Number, default: 0, min: 0 },
    skipped: { type: Number, default: 0, min: 0 },
    errors: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['preview', 'imported', 'failed', 'partial'], default: 'preview' }
}, { _id: false });

const mapPracticeImportBatchSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    commitToken: { type: String, default: undefined, trim: true },
    files: [fileSummarySchema],
    newSkillsCreated: [{ type: String, trim: true, uppercase: true }],
    mode: { type: String, enum: ['stop_on_error', 'skip_errors'], default: 'stop_on_error' },
    summary: {
        files: { type: Number, default: 0, min: 0 },
        created: { type: Number, default: 0, min: 0 },
        updated: { type: Number, default: 0, min: 0 },
        skipped: { type: Number, default: 0, min: 0 },
        errors: { type: Number, default: 0, min: 0 }
    }
}, { timestamps: true });

mapPracticeImportBatchSchema.index({ school: 1, importedBy: 1, createdAt: -1 });
mapPracticeImportBatchSchema.index({ school: 1, commitToken: 1 }, { unique: true, partialFilterExpression: { commitToken: { $type: 'string' } } });
mapPracticeImportBatchSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPracticeImportBatch', mapPracticeImportBatchSchema);
