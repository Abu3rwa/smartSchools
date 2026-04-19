import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const groupingWorksheetPackSchema = new mongoose.Schema(
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
            required: true,
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
        title: {
            type: String,
            trim: true,
            default: ''
        },
        language: {
            type: String,
            enum: ['en', 'ar'],
            default: 'en'
        },
        status: {
            type: String,
            enum: ['draft', 'ended', 'published', 'archived', 'canceled'],
            default: 'draft',
            index: true
        },
        version: {
            type: Number,
            default: 1,
            min: 1
        },
        snapshot: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        metadata: {
            totalStudents: { type: Number, default: 0 },
            totalActivities: { type: Number, default: 0 },
            levelCounts: {
                advanced: { type: Number, default: 0 },
                proficient: { type: Number, default: 0 },
                approaching: { type: Number, default: 0 },
                below: { type: Number, default: 0 },
                notStarted: { type: Number, default: 0 }
            }
        },
        generatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        authoringEndedAt: {
            type: Date,
            default: null,
            index: true
        },
        authoringEndedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        publishedAt: {
            type: Date,
            default: null,
            index: true
        },
        publishedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    { timestamps: true }
);

groupingWorksheetPackSchema.index({ school: 1, class: 1, standard: 1, createdAt: -1 });
groupingWorksheetPackSchema.index({ school: 1, class: 1, standard: 1, status: 1, createdAt: -1 });

groupingWorksheetPackSchema.plugin(tenantIsolationPlugin);

const GroupingWorksheetPack = mongoose.model('GroupingWorksheetPack', groupingWorksheetPackSchema);

export default GroupingWorksheetPack;
