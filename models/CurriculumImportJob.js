import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const curriculumImportJobSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        mapId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CurriculumMap',
            required: true,
            index: true
        },
        sourceDocumentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CurriculumSourceDocument',
            required: true,
            index: true
        },
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        status: {
            type: String,
            enum: ['queued', 'processing', 'completed', 'failed'],
            default: 'queued',
            index: true
        },
        stage: {
            type: String,
            trim: true,
            default: 'queued'
        },
        error: {
            type: String,
            trim: true,
            default: ''
        },
        resultSummary: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        suggestedSections: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        promptVersion: {
            type: String,
            trim: true,
            default: 'curriculum_map_import_v1'
        },
        tokenUsageRef: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AITokenUsage',
            default: null
        },
        startedAt: {
            type: Date,
            default: null
        },
        completedAt: {
            type: Date,
            default: null
        },
        appliedAt: {
            type: Date,
            default: null
        },
        appliedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    { timestamps: true }
);

curriculumImportJobSchema.index({ school: 1, mapId: 1, createdAt: -1 });
curriculumImportJobSchema.index({ school: 1, status: 1, createdAt: 1 });

curriculumImportJobSchema.plugin(tenantIsolationPlugin);

const CurriculumImportJob = mongoose.model('CurriculumImportJob', curriculumImportJobSchema);
export default CurriculumImportJob;

