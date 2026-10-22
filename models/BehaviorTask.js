import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { BEHAVIOR_TASK_TYPES, BEHAVIOR_TASK_STATUSES } from '../constants/behavior.js';

const submissionSchema = new mongoose.Schema({
    text: { type: String, trim: true, maxlength: 20000, default: '' },
    answers: [{ question: String, answer: String }],
    wordCount: { type: Number, default: 0 },
    submittedAt: { type: Date, default: null },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

const behaviorTaskSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'BehaviorIncident', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    behaviorType: { type: mongoose.Schema.Types.ObjectId, ref: 'BehaviorType', required: true },
    stepOrder: { type: Number, default: null },

    taskType: { type: String, enum: BEHAVIOR_TASK_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, trim: true, maxlength: 2000, default: '' },
    questions: { type: [String], default: [] },
    toWhom: { type: String, enum: ['person-affected', 'school', 'self', null], default: null },
    minWords: { type: Number, min: 0, max: 2000, default: 0 },

    assignedAt: { type: Date, default: () => new Date() },
    dueAt: { type: Date, default: null },
    status: { type: String, enum: BEHAVIOR_TASK_STATUSES, default: 'assigned' },

    // Informational only: nothing in this module changes attendance or timetabling.
    requiresReturnClearance: { type: Boolean, default: false },

    submission: { type: submissionSchema, default: null },
    verifier: {
        rule: { type: String, default: 'logging-staff' },
        role: { type: String, default: null },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    revisionComment: { type: String, trim: true, maxlength: 1000, default: '' },
    waiverReason: { type: String, trim: true, maxlength: 1000, default: '' },
    reminderSentAt: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 2000, default: '' }
}, { timestamps: true });

behaviorTaskSchema.plugin(tenantIsolationPlugin);
behaviorTaskSchema.set('collection', 'behavior_tasks');

// Drives the overdue job and the "clear to return" check.
behaviorTaskSchema.index({ school: 1, dueAt: 1, status: 1 }, { background: true });
behaviorTaskSchema.index({ school: 1, student: 1, status: 1, dueAt: 1 }, { background: true });
behaviorTaskSchema.index({ incident: 1, taskType: 1 }, { background: true });
behaviorTaskSchema.index({ school: 1, 'verifier.user': 1, status: 1 }, { background: true });

export default mongoose.model('BehaviorTask', behaviorTaskSchema);
