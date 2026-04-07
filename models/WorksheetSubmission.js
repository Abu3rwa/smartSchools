import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const questionResultSchema = new mongoose.Schema({
    questionNumber: { type: Number, required: true, min: 1 },
    studentAnswer: { type: String, default: '' },
    correctAnswer: { type: String, default: '' },
    isCorrect: { type: Boolean, default: null },
    partialCredit: { type: Number, min: 0, max: 1, default: null },
    pointsEarned: { type: Number, min: 0, default: 0 },
    pointsTotal: { type: Number, min: 0, default: 1 },
    feedback: { type: String, default: '' },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    markSource: {
        type: String,
        enum: ['model', 'ai', 'teacher'],
        default: 'ai'
    },
    standardId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        default: null
    },
    // Teacher override tracking
    overriddenBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    overriddenAt: { type: Date, default: null },
    originalIsCorrect: { type: Boolean, default: null },
    originalPointsEarned: { type: Number, default: null }
}, { _id: false });

const worksheetSubmissionSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    worksheet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Worksheet',
        required: [true, 'Worksheet is required']
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: [true, 'Student is required']
    },
    // Images (Firebase Storage URLs)
    originalImage: {
        type: String,
        required: [true, 'Original image is required']
    },
    annotatedImage: {
        type: String,
        default: null
    },
    // Scores
    totalScore: {
        type: Number,
        min: 0,
        default: 0
    },
    maxScore: {
        type: Number,
        min: 0,
        default: 0
    },
    percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    // Question-level results (embedded for single-read performance)
    questionResults: [questionResultSchema],
    // Processing
    status: {
        type: String,
        enum: ['pending', 'processing', 'marked', 'reviewed', 'published', 'failed'],
        default: 'pending'
    },
    processingError: {
        type: String,
        default: null
    },
    // Teacher review
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    // Gradebook link
    gradeRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Grade',
        default: null
    },
    gradebookRecorded: {
        type: Boolean,
        default: false
    },
    // Student identification (for batch uploads)
    identifiedName: {
        type: String,
        default: null
    },
    identificationMethod: {
        type: String,
        enum: ['barcode', 'handwriting', 'order', 'manual', null],
        default: null
    },
    identificationConfidence: {
        type: Number,
        min: 0,
        max: 1,
        default: null
    }
}, {
    timestamps: true
});

// Indexes
worksheetSubmissionSchema.index({ school: 1, worksheet: 1, student: 1 }, { unique: true });
worksheetSubmissionSchema.index({ school: 1, worksheet: 1, status: 1 });
worksheetSubmissionSchema.index({ school: 1, student: 1, createdAt: -1 });
worksheetSubmissionSchema.index({ school: 1, status: 1, createdAt: -1 });

worksheetSubmissionSchema.plugin(tenantIsolationPlugin);

const WorksheetSubmission = mongoose.model('WorksheetSubmission', worksheetSubmissionSchema);
export default WorksheetSubmission;
