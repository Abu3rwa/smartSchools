import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const reportDraftSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        // 'partial' = some recipients sent, some definitively failed;
        // 'unknown' = provider acceptance could not be confirmed for at least
        // one recipient — never auto-retried, a human must check first.
        enum: ['draft', 'approved', 'sending', 'sent', 'partial', 'unknown', 'failed', 'cancelled'],
        default: 'draft'
    },
    reportType: {
        type: String,
        enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
        required: true
    },
    period: {
        type: String,
        required: true
    },
    dateRange: {
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true }
    },
    language: {
        type: String,
        trim: true,
        lowercase: true,
        required: true
    },
    requestedLanguages: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    content: {
        type: String,
        required: true
    },
    // The teacher's own words to the family. Stored and rendered verbatim —
    // the AI never sees or rewrites it.
    teacherRemark: {
        type: String,
        default: '',
        trim: true,
        maxlength: 1200
    },
    evidenceSnapshot: {
        availableSources: [String],
        noDataSources: [String],
        failedSources: [String],
        totalRecordCount: Number,
        sources: mongoose.Schema.Types.Mixed
    },
    profileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ReportProfile',
        default: null
    },
    recipients: {
        student: { type: Boolean, default: true },
        mother: { type: Boolean, default: true },
        father: { type: Boolean, default: true },
        guardian: { type: Boolean, default: true },
        teacher: { type: Boolean, default: false }
    },
    approvedAt: {
        type: Date,
        default: null
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    // Frozen at approval: exactly what was reviewed is what gets sent.
    approvedSnapshot: {
        subject: { type: String, default: null },
        html: { type: String, default: null },
        text: { type: String, default: null },
        recipients: [{
            email: String,
            name: String,
            type: String
        }],
        senderEmail: { type: String, default: null },
        senderName: { type: String, default: null },
        language: { type: String, default: null },
        requestedLanguages: [String],
        renderedAt: { type: Date, default: null },
        revision: { type: Number, default: null }
    },
    // Optimistic concurrency for edits: a stale tab cannot overwrite newer work.
    revision: {
        type: Number,
        default: 0
    },
    sentAt: {
        type: Date,
        default: null
    },
    sendError: {
        type: String,
        default: null
    },
    sendAttempts: {
        type: Number,
        default: 0
    },
    tokenUsage: {
        inputTokens: { type: Number, default: 0 },
        outputTokens: { type: Number, default: 0 },
        totalTokens: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

reportDraftSchema.plugin(tenantIsolationPlugin);

reportDraftSchema.index({ school: 1, student: 1, status: 1 });
reportDraftSchema.index({ school: 1, teacher: 1, createdAt: -1 });
reportDraftSchema.index({ status: 1, createdAt: -1 });

export const ReportDraft = mongoose.model('ReportDraft', reportDraftSchema);
