import mongoose from 'mongoose';

const gmailCleanupAuditSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        accountEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        source: {
            type: String,
            enum: ['all_sent', 'app_sent'],
            required: true
        },
        period: {
            type: String,
            enum: ['today', 'this_week', 'this_month', 'all_time'],
            required: true
        },
        timeZone: {
            type: String,
            required: true
        },
        previewCount: {
            type: Number,
            required: true
        },
        trashedCount: {
            type: Number,
            default: 0
        },
        failedCount: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            enum: ['started', 'completed', 'partial', 'failed'],
            default: 'started'
        }
    },
    { timestamps: true }
);

gmailCleanupAuditSchema.index({ user: 1, createdAt: -1 });

const GmailCleanupAudit = mongoose.model('GmailCleanupAudit', gmailCleanupAuditSchema);
export default GmailCleanupAudit;
