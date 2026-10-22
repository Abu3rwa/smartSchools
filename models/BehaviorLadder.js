import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import {
    BEHAVIOR_TASK_TYPES,
    BEHAVIOR_OVERFLOW_BEHAVIORS,
    BEHAVIOR_VERIFIER_RULES
} from '../constants/behavior.js';

const consequenceSchema = new mongoose.Schema({
    taskType: { type: String, enum: BEHAVIOR_TASK_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, trim: true, maxlength: 2000, default: '' },
    dueInDays: { type: Number, min: 0, max: 120, default: 5 },
    // Written tasks only; 0 means "no minimum".
    minWords: { type: Number, min: 0, max: 2000, default: 0 },
    toWhom: {
        type: String,
        enum: ['person-affected', 'school', 'self', null],
        default: null
    },
    questions: { type: [String], default: [] },
    verifierRule: { type: String, enum: BEHAVIOR_VERIFIER_RULES, default: null },
    // A suspension step is always a suggestion a human must decide on.
    requiresHumanDecision: { type: Boolean, default: false }
}, { _id: true });

const stepSchema = new mongoose.Schema({
    order: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    summary: { type: String, trim: true, maxlength: 1000, default: '' },
    consequences: { type: [consequenceSchema], default: [] },
    actions: {
        emailParents: { type: Boolean, default: false },
        showInPortal: { type: Boolean, default: true },
        ccRoles: { type: [String], default: [] }
    },
    // null = inherit settings.approval.defaultRequired
    requiresApproval: { type: Boolean, default: null },
    approverRoles: { type: [String], default: [] },
    emailTemplateKey: { type: String, default: null }
}, { _id: true });

const behaviorLadderSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    behaviorType: { type: mongoose.Schema.Types.ObjectId, ref: 'BehaviorType', default: null },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    overflowBehavior: {
        type: String,
        enum: BEHAVIOR_OVERFLOW_BEHAVIORS,
        default: 'flag_for_admin'
    },
    steps: { type: [stepSchema], default: [] },
    seedKey: { type: String, trim: true, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

behaviorLadderSchema.plugin(tenantIsolationPlugin);
behaviorLadderSchema.set('collection', 'behavior_ladders');

behaviorLadderSchema.index({ school: 1, behaviorType: 1 }, { background: true });
behaviorLadderSchema.index({ school: 1, seedKey: 1 }, { background: true });

behaviorLadderSchema.methods.stepAt = function stepAt(order) {
    return (this.steps || []).find((step) => step.order === order) || null;
};

behaviorLadderSchema.methods.lastStep = function lastStep() {
    const steps = this.steps || [];
    if (!steps.length) return null;
    return steps.reduce((latest, step) => (step.order > latest.order ? step : latest), steps[0]);
};

const BehaviorLadder = mongoose.model('BehaviorLadder', behaviorLadderSchema);

export default BehaviorLadder;
