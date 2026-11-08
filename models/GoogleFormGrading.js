import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * AI grading state for one student's Google Form submission. Kept separate from
 * GoogleFormSubmission so response syncs can never overwrite suggestions or
 * approved scores. Approved scores are the only ones that reach the gradebook.
 */
const googleFormGradingSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    submission: { type: mongoose.Schema.Types.ObjectId, ref: 'GoogleFormSubmission', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    status: {
        type: String,
        enum: ['pending', 'suggested', 'approved', 'stale', 'failed'],
        default: 'pending',
        index: true
    },
    responseVersion: { type: String, default: '' },
    questions: [{
        _id: false,
        questionId: { type: String, required: true },
        maxPoints: { type: Number, required: true, min: 0 },
        suggestedScore: { type: Number, default: null, min: 0 },
        suggestedFeedback: { type: String, trim: true, maxlength: 1000, default: '' },
        approvedScore: { type: Number, default: null, min: 0 },
        approvedFeedback: { type: String, trim: true, maxlength: 1000, default: '' },
        error: { type: String, trim: true, maxlength: 500, default: '' }
    }],
    suggestedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    error: { type: String, trim: true, maxlength: 500, default: '' }
}, { timestamps: true });

googleFormGradingSchema.index({ school: 1, assignment: 1, student: 1 }, { unique: true });
googleFormGradingSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('GoogleFormGrading', googleFormGradingSchema);