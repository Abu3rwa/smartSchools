import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const objectiveHistorySchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    score: {
        type: Number,
        min: 0,
        max: 100,
        default: null
    },
    masteryLevel: {
        type: String,
        enum: ['not_started', 'at_risk', 'developing', 'mastered'],
        default: 'not_started'
    },
    sourceType: {
        type: String,
        enum: ['grade', 'practice', 'self_assessment'],
        default: 'grade'
    },
    sourceId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    }
}, { _id: false });

const academicExcellenceObjectiveSchema = new mongoose.Schema({
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
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true,
        index: true
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        default: null,
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
    standardCode: {
        type: String,
        default: '',
        trim: true
    },
    lessonPlanIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LessonPlan'
    }],
    masteryLevel: {
        type: String,
        enum: ['not_started', 'at_risk', 'developing', 'mastered'],
        default: 'not_started',
        index: true
    },
    masteryScore: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    trend: {
        type: String,
        enum: ['improving', 'stable', 'declining'],
        default: 'stable'
    },
    history: {
        type: [objectiveHistorySchema],
        default: []
    },
    practiceTasksAssigned: {
        type: Number,
        default: 0,
        min: 0
    },
    practiceTasksCompleted: {
        type: Number,
        default: 0,
        min: 0
    },
    lastPracticeDate: {
        type: Date,
        default: null
    },
    totalPracticeMinutes: {
        type: Number,
        default: 0,
        min: 0
    },
    isDisabledForStudent: {
        type: Boolean,
        default: false
    },
    isDisabledForClass: {
        type: Boolean,
        default: false
    },
    disabledReason: {
        type: String,
        default: '',
        trim: true
    },
    disabledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    disabledAt: {
        type: Date,
        default: null
    },
    firstWeakDetectedAt: {
        type: Date,
        default: null
    },
    deletedAt: {
        type: Date,
        default: null
    },
    lastUpdatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

academicExcellenceObjectiveSchema.pre('save', function(next) {
    if (Array.isArray(this.history) && this.history.length > 20) {
        this.history = this.history.slice(-20);
    }
    this.lastUpdatedAt = new Date();
    next();
});

academicExcellenceObjectiveSchema.index(
    { school: 1, student: 1, subject: 1, objectiveKey: 1 },
    { unique: true }
);
academicExcellenceObjectiveSchema.index({ school: 1, class: 1, subject: 1, masteryLevel: 1 });
academicExcellenceObjectiveSchema.index({ school: 1, academicYear: 1, masteryLevel: 1 });

academicExcellenceObjectiveSchema.plugin(tenantIsolationPlugin);

const AcademicExcellenceObjective = mongoose.model(
    'AcademicExcellenceObjective',
    academicExcellenceObjectiveSchema
);

export default AcademicExcellenceObjective;
