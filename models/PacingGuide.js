import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const workflowSchema = new mongoose.Schema({
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewDecision: {
        type: String,
        enum: ['approved', 'rejected', 'changes_requested', null],
        default: null
    },
    reviewNote: { type: String, trim: true, default: '' },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: Date
}, { _id: false });

const unitReferenceSchema = new mongoose.Schema({
    unitId: { type: mongoose.Schema.Types.ObjectId, default: null },
    unitCode: { type: String, trim: true, default: '' },
    unitTitle: { type: String, trim: true, default: '' }
}, { _id: false });

const pacingEntrySchema = new mongoose.Schema({
    weekNumber: { type: Number, required: true, min: 1, max: 53 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    unitRef: { type: unitReferenceSchema, default: () => ({}) },
    focus: { type: String, trim: true, default: '' },
    objectives: [{ type: String, trim: true }],
    assessment: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    isLocked: { type: Boolean, default: false }
}, { _id: true });

const auditEntrySchema = new mongoose.Schema({
    action: { type: String, required: true, trim: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    message: { type: String, trim: true, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const pacingGuideSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    academicYear: {
        type: String,
        required: true,
        trim: true
    },
    grade: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        default: null
    },
    term: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    status: {
        type: String,
        enum: ['draft', 'in_review', 'published'],
        default: 'draft',
        index: true
    },
    syncStatus: {
        type: String,
        enum: ['in_sync', 'out_of_sync', 'reconciled'],
        default: 'in_sync',
        index: true
    },
    mapRef: {
        mapId: { type: mongoose.Schema.Types.ObjectId, ref: 'CurriculumMap', required: true },
        mapVersion: { type: Number, required: true, min: 1 }
    },
    isBaseline: {
        type: Boolean,
        default: true
    },
    overridePolicy: {
        allowTeacherOverride: { type: Boolean, default: true },
        requireApproval: { type: Boolean, default: true }
    },
    entries: [pacingEntrySchema],
    workflow: {
        type: workflowSchema,
        default: () => ({})
    },
    auditTrail: {
        type: [auditEntrySchema],
        default: []
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

pacingGuideSchema.index(
    { school: 1, academicYear: 1, classId: 1, subject: 1, term: 1, isBaseline: 1 },
    { unique: true, partialFilterExpression: { isBaseline: true } }
);
pacingGuideSchema.index({ school: 1, academicYear: 1, status: 1 });
pacingGuideSchema.index({ school: 1, classId: 1, subject: 1 });
pacingGuideSchema.index({ school: 1, syncStatus: 1, updatedAt: -1 });

pacingGuideSchema.plugin(tenantIsolationPlugin);

const PacingGuide = mongoose.model('PacingGuide', pacingGuideSchema);
export default PacingGuide;
