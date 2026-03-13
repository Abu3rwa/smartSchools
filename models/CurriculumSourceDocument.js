import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const curriculumSourceDocumentSchema = new mongoose.Schema(
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
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        sourceType: {
            type: String,
            enum: ['upload', 'google_doc'],
            default: 'upload'
        },
        originalName: {
            type: String,
            trim: true,
            default: ''
        },
        mimeType: {
            type: String,
            trim: true,
            default: ''
        },
        size: {
            type: Number,
            default: 0,
            min: 0
        },
        fileRef: {
            type: String,
            trim: true,
            default: ''
        },
        storagePath: {
            type: String,
            trim: true,
            default: ''
        },
        parseStatus: {
            type: String,
            enum: ['pending', 'processing', 'parsed', 'failed'],
            default: 'pending',
            index: true
        },
        extractedText: {
            type: String,
            default: ''
        },
        parseError: {
            type: String,
            trim: true,
            default: ''
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    { timestamps: true }
);

curriculumSourceDocumentSchema.index({ school: 1, mapId: 1, createdAt: -1 });

curriculumSourceDocumentSchema.plugin(tenantIsolationPlugin);

const CurriculumSourceDocument = mongoose.model('CurriculumSourceDocument', curriculumSourceDocumentSchema);
export default CurriculumSourceDocument;

