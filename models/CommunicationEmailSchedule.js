import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const selectedTokenSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, trim: true },
        label: { type: String, trim: true, default: '' },
        tokenType: { type: String, enum: ['group', 'individual'], default: 'group' },
        audience: {
            type: String,
            enum: ['students', 'parents', 'teachers', 'everyone'],
            default: 'students'
        }
    },
    { _id: false }
);

const recipientSnapshotSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, trim: true, lowercase: true },
        category: {
            type: String,
            enum: ['students', 'parents', 'teachers'],
            default: 'students'
        },
        displayName: { type: String, trim: true, default: '' }
    },
    { _id: false }
);

const attachmentSnapshotSchema = new mongoose.Schema(
    {
        filename: { type: String, trim: true, default: '' },
        mimeType: { type: String, trim: true, default: '' },
        size: { type: Number, default: 0 },
        storagePath: { type: String, trim: true, default: '' }
    },
    { _id: false }
);

const communicationEmailScheduleSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        senderRole: { type: String, default: '' },
        senderEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        fromLabel: {
            type: String,
            trim: true,
            default: ''
        },
        subject: {
            type: String,
            required: true,
            trim: true,
            maxlength: 220
        },
        bodyHtmlSnapshot: { type: String, default: '' },
        bodyTextSnapshot: { type: String, default: '' },
        selectedTokens: {
            parents: { type: [selectedTokenSchema], default: [] },
            teachers: { type: [selectedTokenSchema], default: [] },
            students: { type: [selectedTokenSchema], default: [] }
        },
        blockedTokenKeys: {
            type: [String],
            default: []
        },
        recipientSummary: {
            students: { type: Number, default: 0 },
            parents: { type: Number, default: 0 },
            teachers: { type: Number, default: 0 },
            duplicatesRemoved: { type: Number, default: 0 },
            invalidExcluded: { type: Number, default: 0 },
            totalResolved: { type: Number, default: 0 },
            totalSent: { type: Number, default: 0 },
            totalFailed: { type: Number, default: 0 }
        },
        permissionSnapshot: {
            role: { type: String, default: '' },
            permissions: { type: [String], default: [] },
            scope: { type: mongoose.Schema.Types.Mixed, default: {} }
        },
        attachments: {
            type: [attachmentSnapshotSchema],
            default: []
        },
        recipientSnapshot: {
            type: [recipientSnapshotSchema],
            default: []
        },
        scheduledFor: {
            type: Date,
            required: true,
            index: true
        },
        scheduledForLocal: {
            type: String,
            trim: true,
            default: ''
        },
        clientTimeZone: {
            type: String,
            trim: true,
            default: 'UTC'
        },
        status: {
            type: String,
            enum: ['scheduled', 'processing', 'sent', 'partial', 'failed', 'cancelled'],
            default: 'scheduled',
            index: true
        },
        log: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CommunicationEmailLog',
            default: null
        },
        attempts: {
            type: Number,
            default: 0
        },
        processingStartedAt: {
            type: Date,
            default: null
        },
        processedAt: {
            type: Date,
            default: null
        },
        sendResults: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        lastError: {
            type: String,
            default: ''
        }
    },
    { timestamps: true }
);

communicationEmailScheduleSchema.index({ school: 1, status: 1, scheduledFor: 1, createdAt: 1 });

communicationEmailScheduleSchema.plugin(tenantIsolationPlugin);

const CommunicationEmailSchedule = mongoose.model('CommunicationEmailSchedule', communicationEmailScheduleSchema);
export default CommunicationEmailSchedule;
