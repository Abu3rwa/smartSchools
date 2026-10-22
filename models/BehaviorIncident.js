import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { BEHAVIOR_INCIDENT_STATUSES } from '../constants/behavior.js';

const stepSnapshotSchema = new mongoose.Schema({
    order: { type: Number, default: null },
    title: { type: String, default: '' },
    stepId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ladder: { type: mongoose.Schema.Types.ObjectId, default: null }
}, { _id: false });

const countSnapshotSchema = new mongoose.Schema({
    // Occurrences already on record for this student + behavior in the window.
    priorCount: { type: Number, default: 0 },
    // The occurrence this incident represents, i.e. priorCount + 1.
    occurrence: { type: Number, default: 1 },
    mode: { type: String, default: null },
    windowKey: { type: String, default: null },
    windowStart: { type: Date, default: null },
    windowEnd: { type: Date, default: null },
    ladderLength: { type: Number, default: 0 },
    // repeat_last | flag_for_admin | within_ladder
    overflow: { type: String, default: null },
    countedStatuses: { type: String, default: 'excluding voided and merged' }
}, { _id: false });

const approvalSchema = new mongoose.Schema({
    required: { type: Boolean, default: false },
    requestedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decision: { type: String, enum: ['approved', 'rejected', null], default: null },
    comment: { type: String, maxlength: 1000, default: '' },
    approverRoles: { type: [String], default: [] },
    remindedAt: { type: Date, default: null },
    escalatedAt: { type: Date, default: null }
}, { _id: false });

const emailDraftSchema = new mongoose.Schema({
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    subject: { type: String, default: '' },
    body: { type: String, default: '' },
    // Recipients are resolved but never dispatched: this module has no transport.
    recipients: [{ name: String, email: String, relation: String, hasEmail: Boolean }],
    cc: [{ role: String, name: String, email: String }],
    missingParentEmail: { type: Boolean, default: false },
    templateKey: { type: String, default: null },
    readyAt: { type: Date, default: null }
}, { _id: false });

const behaviorIncidentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    academicYear: { type: String, trim: true, default: null },
    behaviorType: { type: mongoose.Schema.Types.ObjectId, ref: 'BehaviorType', required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    occurredAt: { type: Date, required: true, default: () => new Date() },

    // Staff-only. The portal DTO never copies this field.
    staffNotes: { type: String, trim: true, maxlength: 4000, default: '' },
    // Referenced students are stored as ids only; names are never rendered into
    // a parent or student payload.
    otherStudentsInvolved: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],

    status: { type: String, enum: BEHAVIOR_INCIDENT_STATUSES, default: 'logged', index: true },

    suggestedStep: { type: stepSnapshotSchema, default: () => ({}) },
    appliedStep: { type: stepSnapshotSchema, default: () => ({}) },
    overrideReason: { type: String, trim: true, maxlength: 1000, default: '' },
    overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    overriddenAt: { type: Date, default: null },

    countSnapshot: { type: countSnapshotSchema, default: () => ({}) },

    isSerious: { type: Boolean, default: false },
    seriousReason: { type: String, trim: true, maxlength: 1000, default: '' },

    approval: { type: approvalSchema, default: () => ({}) },
    emailDraft: { type: emailDraftSchema, default: () => ({}) },
    portalReleased: { type: Boolean, default: false },

    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'BehaviorIncident', default: null },
    voidReason: { type: String, trim: true, maxlength: 1000, default: '' },
    flagForAdmin: { type: Boolean, default: false },
    flaggedForAdminAt: { type: Date, default: null },

    closedAt: { type: Date, default: null },
    studentSubmissionCount: { type: Number, default: 0 }
}, { timestamps: true });

behaviorIncidentSchema.plugin(tenantIsolationPlugin);
behaviorIncidentSchema.set('collection', 'behavior_incidents');

// Occurrence counting and the incident list both read through this prefix.
behaviorIncidentSchema.index({ school: 1, student: 1, behaviorType: 1, occurredAt: -1 }, { background: true });
behaviorIncidentSchema.index({ school: 1, status: 1, occurredAt: -1 }, { background: true });
behaviorIncidentSchema.index({ school: 1, reportedBy: 1, occurredAt: -1 }, { background: true });
behaviorIncidentSchema.index({ school: 1, 'approval.decidedAt': -1 }, { background: true });
behaviorIncidentSchema.index({ school: 1, student: 1, portalReleased: 1, occurredAt: -1 }, { background: true });
behaviorIncidentSchema.index({ school: 1, flagForAdmin: 1, createdAt: -1 }, { background: true });

// A merged or voided incident must never keep contributing to a count.
behaviorIncidentSchema.virtual('countsTowardEscalation').get(function countsTowardEscalation() {
    return !['voided', 'merged'].includes(this.status);
});

behaviorIncidentSchema.set('toJSON', { virtuals: true });
behaviorIncidentSchema.set('toObject', { virtuals: true });

export default mongoose.model('BehaviorIncident', behaviorIncidentSchema);
