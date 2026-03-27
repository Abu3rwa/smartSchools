import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const groupingReportSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: true,
            index: true
        },
        standard: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Standard',
            default: null,
            index: true
        },
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject',
            default: null,
            index: true
        },
        academicYear: {
            type: String,
            trim: true,
            default: '',
            index: true
        },
        reportType: {
            type: String,
            enum: ['per-standard', 'class-overview', 'parent-report', 'bulk'],
            required: true,
            index: true
        },
        generatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        generatedAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        snapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        fileName: {
            type: String,
            trim: true,
            default: ''
        },
        fileRef: {
            type: String,
            trim: true,
            default: ''
        },
        fileUrl: {
            type: String,
            trim: true,
            default: ''
        },
        fileSize: {
            type: Number,
            default: 0
        },
        pageCount: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            enum: ['generating', 'ready', 'distributed', 'archived'],
            default: 'ready',
            index: true
        },
        isArchived: {
            type: Boolean,
            default: false,
            index: true
        },
        archivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        expiresAt: {
            type: Date,
            default: null
        },
        metadata: {
            totalStudents: { type: Number, default: 0 },
            totalStandards: { type: Number, default: 0 },
            levelCounts: {
                advanced: { type: Number, default: 0 },
                proficient: { type: Number, default: 0 },
                approaching: { type: Number, default: 0 },
                below: { type: Number, default: 0 },
                notStarted: { type: Number, default: 0 }
            },
            averageMastery: { type: Number, default: 0 }
        }
    },
    { timestamps: true }
);

groupingReportSchema.index({ school: 1, class: 1, reportType: 1, generatedAt: -1 });

groupingReportSchema.plugin(tenantIsolationPlugin);

const GroupingReport = mongoose.model('GroupingReport', groupingReportSchema);

export default GroupingReport;
