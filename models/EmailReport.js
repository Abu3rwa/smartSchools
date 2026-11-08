import mongoose, { Schema, model } from 'mongoose';

const emailReportSchema = new Schema({
    reportId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    // Draft sends store ReportDraft IDs; legacy AI-report sends store
    // AITokenUsage IDs. The ref is resolved by this discriminator, not populate.
    sourceModel: {
        type: String,
        enum: ['ReportDraft', 'AITokenUsage'],
        default: 'ReportDraft'
    },
    recipientType: {
        type: String,
        enum: ['student', 'mother', 'father', 'guardian', 'teacher', 'parents'],
        required: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    subject: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
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
    sentAt: {
        type: Date,
        default: Date.now
    },
    messageId: {
        type: String,
        required: false
    },
    status: {
        type: String,
        // 'unknown' = provider may have accepted the message but the outcome
        // could not be confirmed; it must never be auto-retried.
        enum: ['sent', 'failed', 'pending', 'bounced', 'unknown'],
        default: 'pending'
    },
    error: {
        type: String,
        required: false
    },
    retryCount: {
        type: Number,
        default: 0
    },
    lastRetryAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Index for efficient queries
emailReportSchema.index({ reportId: 1, recipientType: 1 });
emailReportSchema.index({ status: 1 });
emailReportSchema.index({ sentAt: -1 });

export const EmailReport = model('EmailReport', emailReportSchema);
