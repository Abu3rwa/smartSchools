import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const aiSessionQuestionSchema = new mongoose.Schema({
    questionId: { type: String, required: true, trim: true },
    questionText: { type: String, required: true, trim: true },
    questionType: {
        type: String,
        enum: ['multiple_choice', 'short_answer'],
        required: true
    },
    options: [{ type: String, trim: true }],
    correctAnswer: { type: String, default: '', trim: true, select: false },
    explanation: { type: String, default: '', trim: true, select: false },
    studentAnswer: { type: String, default: '', trim: true },
    isCorrect: { type: Boolean, default: null },
    aiFeedback: { type: String, default: '', trim: true },
    answeredAt: { type: Date, default: null }
}, { _id: false });

const academicExcellenceTaskSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    academicYear: {
        type: String,
        default: null,
        index: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
        index: true
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true,
        index: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true,
        index: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    objectiveKey: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    objectiveName: {
        type: String,
        default: '',
        trim: true
    },
    objectiveRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AcademicExcellenceObjective',
        default: null
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    taskType: {
        type: String,
        enum: [
            'practice_questions',
            'reading',
            'teacher_review',
            'peer_discussion',
            'project',
            'custom',
            'ai_interactive'
        ],
        default: 'practice_questions'
    },
    resourceUrl: {
        type: String,
        default: '',
        trim: true
    },
    estimatedMinutes: {
        type: Number,
        min: 0,
        default: 0
    },
    status: {
        type: String,
        enum: ['assigned', 'in_progress', 'completed', 'skipped', 'overdue'],
        default: 'assigned',
        index: true
    },
    assignedAt: {
        type: Date,
        default: Date.now
    },
    dueDate: {
        type: Date,
        default: null
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    skippedAt: {
        type: Date,
        default: null
    },
    skippedReason: {
        type: String,
        default: '',
        trim: true
    },
    studentScore: {
        type: Number,
        min: 0,
        max: 100,
        default: null
    },
    studentNotes: {
        type: String,
        default: '',
        trim: true
    },
    teacherFeedback: {
        type: String,
        default: '',
        trim: true
    },
    teacherReviewedAt: {
        type: Date,
        default: null
    },
    completionNotificationSent: {
        type: Boolean,
        default: false
    },
    completionNotificationSentAt: {
        type: Date,
        default: null
    },
    aiSession: {
        questions: {
            type: [aiSessionQuestionSchema],
            default: []
        },
        sessionScore: {
            type: Number,
            min: 0,
            max: 100,
            default: null
        },
        sessionCompleted: {
            type: Boolean,
            default: false
        },
        sessionCompletedAt: {
            type: Date,
            default: null
        },
        currentQuestionIndex: {
            type: Number,
            min: 0,
            default: 0
        }
    }
}, {
    timestamps: true
});

academicExcellenceTaskSchema.index({ school: 1, student: 1, objectiveKey: 1, status: 1 });
academicExcellenceTaskSchema.index({ school: 1, teacher: 1, status: 1 });
academicExcellenceTaskSchema.index({ school: 1, class: 1, status: 1, dueDate: 1 });

academicExcellenceTaskSchema.plugin(tenantIsolationPlugin);

const AcademicExcellenceTask = mongoose.model(
    'AcademicExcellenceTask',
    academicExcellenceTaskSchema
);

export default AcademicExcellenceTask;
