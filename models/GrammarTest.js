import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const optionSchema = new mongoose.Schema(
    { label: { type: String, trim: true }, text: { type: String, trim: true } },
    { _id: false }
);

const questionSchema = new mongoose.Schema({
    instruction: { type: String, trim: true, default: '' },
    questionText: { type: String, required: true, trim: true },
    questionType: { type: String, enum: ['multiple_choice', 'true_false'], required: true },
    options: [optionSchema],
    correctAnswer: { type: String, required: true, trim: true },
    explanation: { type: String, trim: true, default: '' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    grammarLevel: {
        type: String,
        enum: ['beginner', 'elementary', 'pre_intermediate', 'intermediate', 'upper_intermediate', 'advanced'],
        default: null,
    },
    skill: { type: String, trim: true, default: '' },
    subskill: { type: String, trim: true, default: '' },
    gradingMode: { type: String, enum: ['exact_match', 'normalized_match', 'conceptual'], default: 'exact_match' },
}, { _id: true });

const grammarTestSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    title: { type: String, trim: true, maxlength: 200, default: 'Grammar Test' },
    academicYear: { type: String, default: null },
    semester: { type: Number, enum: [1, 2], default: null },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    grammarLevels: [{
        type: String,
        enum: ['beginner', 'elementary', 'pre_intermediate', 'intermediate', 'upper_intermediate', 'advanced'],
    }],
    practiceConfig: {
        questionLimit: { type: Number, min: 1, default: null },
        timeLimitSeconds: { type: Number, min: 60, default: null },
        allowedQuestionTypes: [{ type: String, enum: ['multiple_choice', 'true_false'] }],
        allowedDifficulties: [{ type: String, enum: ['easy', 'medium', 'hard'] }],
        availability: {
            startAt: { type: Date, default: null },
            endAt: { type: Date, default: null },
        },
        lockStudentOptions: { type: Boolean, default: false },
    },
    assessmentConfig: {
        maxMarks: { type: Number, min: 1, default: 100 },
        passMarks: { type: Number, min: 0, default: 50 },
        resultsVisibility: { type: String, enum: ['immediate', 'manual_release'], default: 'immediate' },
        resultsReleaseAt: { type: Date, default: null },
    },
    // Teacher-controlled on/off switch — no date manipulation needed
    isEnabled: { type: Boolean, default: true },
    questions: [questionSchema],
    questionWorkflow: {
        status: { type: String, enum: ['draft', 'published'], default: 'draft' },
        preGeneratedQuestionCount: { type: Number, min: 1, max: 50, default: 10 },
        publishedAt: { type: Date, default: null },
        publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    // Internal bridge to the StandardAssignment used for student practice sessions
    linkedAssignment: { type: mongoose.Schema.Types.ObjectId, ref: 'StandardAssignment', default: null },
    notifyParents: { type: Boolean, default: true },
    notifyStudents: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

grammarTestSchema.index({ school: 1, teacher: 1 });
grammarTestSchema.index({ school: 1, class: 1 });
grammarTestSchema.index({ school: 1, class: 1, subject: 1, createdAt: -1 });
grammarTestSchema.index({ school: 1, academicYear: 1, semester: 1, class: 1 });
grammarTestSchema.index({ school: 1, linkedAssignment: 1 });

grammarTestSchema.plugin(tenantIsolationPlugin);

const GrammarTest = mongoose.model('GrammarTest', grammarTestSchema);
export default GrammarTest;
