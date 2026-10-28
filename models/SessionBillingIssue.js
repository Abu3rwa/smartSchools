import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const sessionBillingIssueSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LiveSession'
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
    },
    entry: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SessionBillingEntry'
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class'
    },
    reason: {
        type: String,
        enum: [
            'missing-rate',
            'missing-student',
            'no-attendance',
            'zero-amount',
            'session-incomplete',
            'duplicate-manual',
            'review-hold',
            'statement-failed'
        ],
        required: true,
        index: true
    },
    detail: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    minutes: {
        type: Number,
        min: 0,
        default: 0
    },
    studentName: {
        type: String,
        trim: true,
        maxlength: 160,
        default: ''
    },
    sessionTitle: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ''
    },
    occurredAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    status: {
        type: String,
        enum: ['open', 'resolved', 'ignored'],
        default: 'open',
        index: true
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolvedAt: {
        type: Date
    },
    resolutionNote: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ''
    }
}, { timestamps: true });

sessionBillingIssueSchema.index({ school: 1, status: 1, occurredAt: -1 });
sessionBillingIssueSchema.index(
    { school: 1, session: 1, student: 1, reason: 1 },
    {
        unique: true,
        partialFilterExpression: { session: { $exists: true }, student: { $exists: true } }
    }
);

sessionBillingIssueSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SessionBillingIssue', sessionBillingIssueSchema);
