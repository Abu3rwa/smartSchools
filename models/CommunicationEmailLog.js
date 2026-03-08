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

const communicationEmailLogSchema = new mongoose.Schema(
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
        senderRole: {
            type: String,
            default: ''
        },
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
        bodyHtmlSnapshot: {
            type: String,
            default: ''
        },
        bodyTextSnapshot: {
            type: String,
            default: ''
        },
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
            type: [{
                filename: String,
                mimeType: String,
                size: Number
            }],
            default: []
        },
        status: {
            type: String,
            enum: ['scheduled', 'sent', 'partial', 'failed', 'blocked'],
            default: 'sent'
        },
        scheduledFor: {
            type: Date,
            default: null,
            index: true
        },
        clientTimeZone: {
            type: String,
            trim: true,
            default: ''
        },
        provider: {
            type: String,
            default: 'gmail_oauth'
        },
        sendResults: {
            type: [mongoose.Schema.Types.Mixed],
            default: []
        },
        sentAt: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    { timestamps: true }
);

communicationEmailLogSchema.index({ school: 1, sender: 1, sentAt: -1 });

communicationEmailLogSchema.plugin(tenantIsolationPlugin);

const CommunicationEmailLog = mongoose.model('CommunicationEmailLog', communicationEmailLogSchema);
export default CommunicationEmailLog;
