import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const standardAssignmentSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    standard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: [true, 'Standard is required']
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Teacher',
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
    title: {
        type: String,
        trim: true,
        maxlength: 200,
        default: 'Standards Assignment'
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
    // If empty, assignment applies to ALL students in the class
    students: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
    }],
    assignedDate: {
        type: Date,
        default: Date.now
    },
    dueDate: {
        type: Date
    },
    instructions: {
        type: String,
        trim: true
    },
    notifyParents: {
        type: Boolean,
        default: true
    },
    notifyStudents: {
        type: Boolean,
        default: true
    },
    practiceConfig: {
        sessionType: {
            type: String,
            enum: ['assessment', 'homework', 'classwork', 'practice'],
            default: 'practice'
        },
        questionLimit: {
            type: Number,
            min: 1,
            default: null
        },
        timeLimitSeconds: {
            type: Number,
            min: 60,
            default: null
        },
        allowedQuestionTypes: [{
            type: String,
            enum: ['multiple_choice', 'short_answer', 'true_false', 'fill_in_the_blank', 'essay' ]
        }],
        allowedDifficulties: [{
            type: String,
            enum: ['easy', 'medium', 'hard']
        }],
        availability: {
            startAt: { type: Date, default: null },
            endAt: { type: Date, default: null }
        },
        lockStudentOptions: {
            type: Boolean,
            default: false
        }
    },
    assessmentConfig: {
        maxMarks: {
            type: Number,
            min: 1,
            default: 100
        },
        passMarks: {
            type: Number,
            min: 0,
            default: 50
        },
        resultsVisibility: {
            type: String,
            enum: ['immediate', 'manual_release'],
            default: 'immediate'
        },
        resultsReleaseAt: {
            type: Date,
            default: null
        }
    },
    questionWorkflow: {
        requireApprovalBeforeStudentAccess: {
            type: Boolean,
            default: true
        },
        preGeneratedQuestionCount: {
            type: Number,
            min: 1,
            max: 100,
            default: 10
        },
        aiLanguages: [{
            type: String,
            trim: true,
            lowercase: true
        }],
        status: {
            type: String,
            enum: ['draft', 'reviewed', 'approved', 'published'],
            default: 'draft'
        },
        currentPoolVersion: {
            type: Number,
            min: 1,
            default: 1
        },
        generatedAt: {
            type: Date,
            default: null
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        reviewedAt: {
            type: Date,
            default: null
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        approvedAt: {
            type: Date,
            default: null
        },
        publishedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        publishedAt: {
            type: Date,
            default: null
        }
    },
    // ── Pool Source Tracking (Feature 1) ──
    poolSource: {
        isFromPool: { type: Boolean, default: false },
        sourcePoolQuestionIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'StandardQuestionPool',
        }],
        generationBatchId: { type: String, trim: true, default: null },
    },
    // Canonical fingerprint of sorted standard IDs for fast compatibility matching
    standardsFingerprint: {
        type: String,
        trim: true,
        default: null,
    },
    // ── Live Edit Versioning (Feature 4) ──
    currentVersion: {
        type: Number,
        default: 1,
        min: 1,
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes
standardAssignmentSchema.index({ school: 1, teacher: 1 });
standardAssignmentSchema.index({ school: 1, class: 1 });
standardAssignmentSchema.index({ school: 1, standard: 1 });
standardAssignmentSchema.index({ school: 1, students: 1 });
standardAssignmentSchema.index({ school: 1, class: 1, subject: 1, createdAt: -1 });
standardAssignmentSchema.index({ school: 1, academicYear: 1, semester: 1, class: 1 });
standardAssignmentSchema.index({ school: 1, class: 1, subject: 1, standard: 1, 'questionWorkflow.status': 1 });

// Apply tenant isolation plugin
standardAssignmentSchema.plugin(tenantIsolationPlugin);

standardAssignmentSchema.pre('save', function ensureQuestionWorkflowAiLanguages(next) {
    if (!this.questionWorkflow) this.questionWorkflow = {};
    const list = Array.isArray(this.questionWorkflow.aiLanguages)
        ? this.questionWorkflow.aiLanguages
            .map((item) => String(item || '').trim().toLowerCase())
            .filter(Boolean)
        : [];
    this.questionWorkflow.aiLanguages = list.length > 0 ? Array.from(new Set(list)).slice(0, 2) : ['en'];
    next();
});

const StandardAssignment = mongoose.model('StandardAssignment', standardAssignmentSchema);
export default StandardAssignment;
