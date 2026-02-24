import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const homeworkSubmissionSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        homeworkAssignment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'HomeworkAssignment',
            required: true,
            index: true
        },
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student',
            required: true,
            index: true
        },
        status: {
            type: String,
            enum: ['not_submitted', 'submitted', 'late', 'graded'],
            default: 'not_submitted',
            index: true
        },
        submissionText: {
            type: String,
            trim: true,
            maxlength: 5000,
            default: ''
        },
        attachments: [
            {
                name: {
                    type: String,
                    trim: true,
                    default: ''
                },
                url: {
                    type: String,
                    trim: true,
                    default: ''
                }
            }
        ],
        submittedAt: {
            type: Date,
            default: null
        },
        gradedAt: {
            type: Date,
            default: null
        },
        grade: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Grade',
            default: null
        },
        attemptCount: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    {
        timestamps: true
    }
);

homeworkSubmissionSchema.index(
    { school: 1, homeworkAssignment: 1, student: 1 },
    { unique: true }
);
homeworkSubmissionSchema.index({ school: 1, student: 1, status: 1 });

homeworkSubmissionSchema.plugin(tenantIsolationPlugin);

const HomeworkSubmission = mongoose.model('HomeworkSubmission', homeworkSubmissionSchema);

export default HomeworkSubmission;
