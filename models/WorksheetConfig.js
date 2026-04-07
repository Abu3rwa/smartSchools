import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const worksheetConfigSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    scopeType: {
        type: String,
        enum: ['school', 'department', 'subject', 'grade', 'teacher'],
        required: true
    },
    scopeId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    // Marking settings
    feedbackLevel: {
        type: String,
        enum: ['minimal', 'standard', 'detailed', 'instructional'],
        default: 'standard'
    },
    partialCreditEnabled: {
        type: Boolean,
        default: true
    },
    spellingTolerance: {
        type: String,
        enum: ['strict', 'moderate', 'lenient'],
        default: 'moderate'
    },
    defaultMarkingMode: {
        type: String,
        enum: ['model', 'ai', 'hybrid'],
        default: 'hybrid'
    },
    aiConfidenceThreshold: {
        type: Number,
        min: 0.5,
        max: 0.99,
        default: 0.90
    },
    teacherOverrideRequired: {
        type: String,
        enum: ['always', 'high_confidence_exempt', 'never'],
        default: 'always'
    },
    // Gradebook sync
    gradebookSyncMode: {
        type: String,
        enum: ['manual', 'prompt', 'auto_after_approval', 'full_auto'],
        default: 'manual'
    },
    // Standards
    autoStandardsDetection: {
        type: Boolean,
        default: true
    },
    autoStandardsRecording: {
        type: Boolean,
        default: false
    },
    // Communication — parent
    parentCommunicationEnabled: {
        type: Boolean,
        default: false
    },
    parentViewMode: {
        type: String,
        enum: ['full', 'score_only', 'summary', 'off'],
        default: 'off'
    },
    parentAlertEnabled: {
        type: Boolean,
        default: false
    },
    parentAlertThreshold: {
        type: Number,
        min: 0,
        max: 100,
        default: 60
    },
    // Communication — student
    studentCommunicationEnabled: {
        type: Boolean,
        default: true
    },
    studentViewMode: {
        type: String,
        enum: ['full', 'marks_only', 'score_only', 'off'],
        default: 'marks_only'
    },
    correctAnswerRevealTiming: {
        type: String,
        enum: ['immediate', 'delayed', 'teacher_release', 'never'],
        default: 'teacher_release'
    },
    // Admin lock — fields that lower scopes cannot override
    lockedFields: [{
        type: String
    }],
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

// One config per scope per school
worksheetConfigSchema.index({ school: 1, scopeType: 1, scopeId: 1 }, { unique: true });

worksheetConfigSchema.plugin(tenantIsolationPlugin);

const WorksheetConfig = mongoose.model('WorksheetConfig', worksheetConfigSchema);
export default WorksheetConfig;
