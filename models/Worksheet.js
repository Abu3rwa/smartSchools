import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const questionMappingSchema = new mongoose.Schema({
    questionNumber: { type: Number, required: true, min: 1 },
    standardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Standard', default: null },
    standardConfidence: { type: Number, min: 0, max: 1, default: null },
    standardConfirmed: { type: Boolean, default: false },
    pointsTotal: { type: Number, min: 0, default: 1 },
    answerType: {
        type: String,
        enum: ['multiple_choice', 'true_false', 'fill_in_blank', 'short_answer', 'numeric', 'matching', 'essay', 'diagram', 'other'],
        default: 'short_answer'
    }
}, { _id: false });

const worksheetSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Teacher is required']
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: [true, 'Class is required']
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: [true, 'Subject is required']
    },
    academicYear: {
        type: String,
        required: [true, 'Academic year is required']
    },
    title: {
        type: String,
        required: [true, 'Worksheet title is required'],
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        trim: true,
        maxlength: 1000
    },
    language: {
        type: String,
        enum: ['en', 'ar', 'fr', 'ur'],
        default: 'en'
    },
    // Marking configuration
    markingMode: {
        type: String,
        enum: ['model', 'ai', 'hybrid'],
        default: 'hybrid'
    },
    gradeCategory: {
        type: String,
        enum: ['classwork', 'homework', 'quiz', 'project', 'assignment', 'other'],
        default: 'classwork'
    },
    // Template and answer key images (Firebase Storage URLs)
    templateImage: {
        type: String,
        default: null
    },
    answerKeyImage: {
        type: String,
        default: null
    },
    // Extracted model answers from the answer key (AI-parsed)
    modelAnswers: [{
        questionNumber: { type: Number, required: true },
        answer: { type: String, required: true }
    }],
    // Question-to-standard mappings
    questionMappings: [questionMappingSchema],
    totalQuestions: {
        type: Number,
        min: 0,
        default: 0
    },
    maxScore: {
        type: Number,
        min: 0,
        default: 0
    },
    // Per-worksheet config overrides (merged with cascading config at runtime)
    config: {
        feedbackLevel: { type: String, enum: ['minimal', 'standard', 'detailed', 'instructional'], default: null },
        partialCreditEnabled: { type: Boolean, default: null },
        spellingTolerance: { type: String, enum: ['strict', 'moderate', 'lenient'], default: null },
        gradebookSyncMode: { type: String, enum: ['manual', 'prompt', 'auto_after_approval', 'full_auto'], default: null },
        parentCommunicationEnabled: { type: Boolean, default: null },
        studentCommunicationEnabled: { type: Boolean, default: null }
    },
    // Status tracking
    status: {
        type: String,
        enum: ['draft', 'processing', 'review', 'published', 'archived'],
        default: 'draft'
    },
    submissionCount: {
        type: Number,
        default: 0,
        min: 0
    },
    markedCount: {
        type: Number,
        default: 0,
        min: 0
    },
    publishedAt: {
        type: Date,
        default: null
    },
    gradebookRecordedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Indexes
worksheetSchema.index({ school: 1, teacher: 1, status: 1, createdAt: -1 });
worksheetSchema.index({ school: 1, class: 1, subject: 1, createdAt: -1 });
worksheetSchema.index({ school: 1, status: 1, createdAt: -1 });
worksheetSchema.index({ school: 1, academicYear: 1, createdAt: -1 });

worksheetSchema.plugin(tenantIsolationPlugin);

const Worksheet = mongoose.model('Worksheet', worksheetSchema);
export default Worksheet;
