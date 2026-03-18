import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const standardsGradebookEntrySchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    assignment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StandardAssignment',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    standard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: true
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    academicYear: {
        type: String,
        default: null
    },
    semester: {
        type: Number,
        enum: [1, 2],
        default: null
    },
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PracticeSession',
        default: null
    },
    status: {
        type: String,
        enum: ['not_started', 'in_progress', 'submitted', 'released'],
        default: 'not_started'
    },
    totalAnswered: {
        type: Number,
        default: 0,
        min: 0
    },
    correctCount: {
        type: Number,
        default: 0,
        min: 0
    },
    score: {
        type: Number,
        default: 0,
        min: 0
    },
    maxScore: {
        type: Number,
        default: 100,
        min: 1
    },
    percentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    submittedAt: {
        type: Date,
        default: null
    },
    releasedAt: {
        type: Date,
        default: null
    },
    manualScore: {
        type: Number,
        enum: [0, 1, 2, 3, 4],
        default: null
    },
    isManualEntry: {
        type: Boolean,
        default: false
    },
    manualEnteredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    manualEnteredAt: {
        type: Date,
        default: null
    },
    effectiveScore: {
        type: Number,
        min: 0,
        max: 4,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

standardsGradebookEntrySchema.index({ school: 1, assignment: 1, student: 1 }, { unique: true });
standardsGradebookEntrySchema.index({ school: 1, assignment: 1, status: 1 });
standardsGradebookEntrySchema.index({ school: 1, student: 1, createdAt: -1 });
standardsGradebookEntrySchema.index({ school: 1, student: 1, academicYear: 1, semester: 1 });
standardsGradebookEntrySchema.index({ school: 1, class: 1, subject: 1, standard: 1, student: 1 });

standardsGradebookEntrySchema.plugin(tenantIsolationPlugin);

const StandardsGradebookEntry = mongoose.model('StandardsGradebookEntry', standardsGradebookEntrySchema);
export default StandardsGradebookEntry;
