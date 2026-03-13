import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const requestPayloadSchema = new mongoose.Schema({
    weekNumber: { type: Number, min: 1, max: 53, required: true },
    focus: { type: String, trim: true, default: '' },
    objectives: [{ type: String, trim: true }],
    assessment: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' }
}, { _id: false });

const decisionSchema = new mongoose.Schema({
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    note: { type: String, trim: true, default: '' }
}, { _id: false });

const pacingOverrideRequestSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    academicYear: {
        type: String,
        required: true,
        trim: true
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    pacingGuide: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PacingGuide',
        required: true
    },
    pacingEntryId: {
        type: String,
        required: true,
        trim: true
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1200
    },
    requestPayload: {
        type: requestPayloadSchema,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true
    },
    decision: {
        type: decisionSchema,
        default: () => ({})
    }
}, {
    timestamps: true
});

pacingOverrideRequestSchema.index({ school: 1, status: 1, createdAt: -1 });
pacingOverrideRequestSchema.index({ school: 1, classId: 1, subject: 1, status: 1 });
pacingOverrideRequestSchema.index({ school: 1, pacingGuide: 1, pacingEntryId: 1, status: 1 });

pacingOverrideRequestSchema.plugin(tenantIsolationPlugin);

const PacingOverrideRequest = mongoose.model('PacingOverrideRequest', pacingOverrideRequestSchema);
export default PacingOverrideRequest;
