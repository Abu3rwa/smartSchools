import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const answerSchema = new mongoose.Schema(
    {
        questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
        answer: { type: String, trim: true, default: '' },
        isCorrect: { type: Boolean, default: null },
        pointsEarned: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
);

const socialStudiesSubmissionSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
        assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialStudiesAssignment', required: true },
        answers: [answerSchema],
        score: { type: Number, default: 0, min: 0 },
        totalPoints: { type: Number, default: 0, min: 0 },
        percentage: { type: Number, default: 0, min: 0, max: 100 },
        status: {
            type: String,
            enum: ['in_progress', 'submitted', 'graded'],
            default: 'in_progress',
        },
        attempt: { type: Number, default: 1, min: 1 },
        startedAt: { type: Date, default: Date.now },
        submittedAt: { type: Date, default: null },
        gradedAt: { type: Date, default: null },
        gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        // Link back to the Grade record created in the gradebook
        grade: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', default: null },
        tabSwitchCount: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true }
);

socialStudiesSubmissionSchema.index({ school: 1, student: 1, assignment: 1 });
socialStudiesSubmissionSchema.index({ school: 1, assignment: 1 });
socialStudiesSubmissionSchema.index({ school: 1, student: 1, status: 1 });

socialStudiesSubmissionSchema.plugin(tenantIsolationPlugin);

const SocialStudiesSubmission = mongoose.model('SocialStudiesSubmission', socialStudiesSubmissionSchema);
export default SocialStudiesSubmission;
