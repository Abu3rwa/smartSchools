import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const googleFormSubmissionSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    googleResponseId: { type: String, required: true, trim: true },
    studentEmail: { type: String, trim: true, lowercase: true, default: '' },
    status: { type: String, enum: ['submitted', 'late'], required: true },
    submittedAt: { type: Date, required: true },
    score: { type: Number, default: null, min: 0 },
    possibleScore: { type: Number, default: null, min: 0 },
    answers: [{
        _id: false,
        questionId: { type: String, required: true },
        question: { type: String, default: '' },
        values: [{ type: String, trim: true }]
    }]
}, { timestamps: true });

googleFormSubmissionSchema.index(
    { school: 1, assignment: 1, googleResponseId: 1 },
    { unique: true }
);
googleFormSubmissionSchema.index({ school: 1, assignment: 1, student: 1 }, { unique: true });
googleFormSubmissionSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('GoogleFormSubmission', googleFormSubmissionSchema);
