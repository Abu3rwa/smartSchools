import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const importIssueSchema = new mongoose.Schema({
    row: { type: Number, required: true, min: 1 },
    field: { type: String, trim: true, default: 'row' },
    code: { type: String, trim: true, required: true },
    message: { type: String, trim: true, required: true },
    data: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const importRunSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    entityType: {
        type: String,
        enum: ['students', 'standards', 'subjects', 'teachers', 'classes', 'rooms', 'timetable_periods'],
        required: true
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fileName: {
        type: String,
        trim: true
    },
    fileHash: {
        type: String,
        trim: true
    },
    totalRows: {
        type: Number,
        default: 0,
        min: 0
    },
    validRows: {
        type: Number,
        default: 0,
        min: 0
    },
    importedRows: {
        type: Number,
        default: 0,
        min: 0
    },
    failedRows: {
        type: Number,
        default: 0,
        min: 0
    },
    skippedRows: {
        type: Number,
        default: 0,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'validating', 'completed', 'failed'],
        default: 'pending'
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date
    },
    durationMs: {
        type: Number,
        default: 0,
        min: 0
    },
    errorReportUrl: {
        type: String,
        trim: true
    },
    errors: {
        type: [importIssueSchema],
        default: []
    },
    warnings: {
        type: [importIssueSchema],
        default: []
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    suppressReservedKeysWarning: true
});

importRunSchema.index({ school: 1, entityType: 1, createdAt: -1 });
importRunSchema.index({ school: 1, fileHash: 1, createdAt: -1 });

importRunSchema.plugin(tenantIsolationPlugin);

const ImportRun = mongoose.model('ImportRun', importRunSchema);
export default ImportRun;
