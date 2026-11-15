import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const taskVersionSchema = new mongoose.Schema({
    id: { type: String, required: true, trim: true, maxlength: 24 },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    titleAr: { type: String, trim: true, maxlength: 240, default: '' },
    note: { type: String, trim: true, maxlength: 400, default: '' },
    noteAr: { type: String, trim: true, maxlength: 400, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
}, { _id: false });

const goalVersionSchema = new mongoose.Schema({
    id: { type: String, required: true, trim: true, maxlength: 24 },
    concern: { type: String, trim: true, maxlength: 30, default: '' },
    domain: { type: String, enum: ['academic', 'character', 'general'], default: 'academic' },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    subjectName: { type: String, trim: true, maxlength: 120, default: '' },
    sourceRole: {
        type: String,
        enum: ['teacher', 'parent', 'student', 'staff', 'homeroom', 'counselor', 'mixed', ''],
        default: 'teacher',
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    titleAr: { type: String, trim: true, maxlength: 200, default: '' },
    description: { type: String, trim: true, maxlength: 600, default: '' },
    descriptionAr: { type: String, trim: true, maxlength: 600, default: '' },
    successLook: { type: String, trim: true, maxlength: 400, default: '' },
    successLookAr: { type: String, trim: true, maxlength: 400, default: '' },
    baseline: { type: String, trim: true, maxlength: 400, default: '' },
    targetDate: { type: Date, default: null },
    responsibleRole: {
        type: String,
        enum: ['teacher', 'counselor', 'family', 'student', 'school', ''],
        default: '',
    },
    responsibleUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    outcome: {
        type: String,
        enum: ['', 'met', 'partially_met', 'not_met', 'insufficient_evidence'],
        default: '',
    },
    outcomeNote: { type: String, trim: true, maxlength: 800, default: '' },
    reviewedAt: { type: Date, default: null },
    homeTasks: { type: [taskVersionSchema], default: [] },
    classTasks: { type: [taskVersionSchema], default: [] },
}, { _id: false });

const supportPlanVersionSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportPlan', required: true },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportCase', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    version: { type: Number, required: true, min: 1 },
    revision: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: ['draft', 'approved', 'published', 'superseded'], default: 'draft' },
    headline: { type: String, trim: true, maxlength: 200, default: '' },
    headlineAr: { type: String, trim: true, maxlength: 200, default: '' },
    summary: { type: String, trim: true, maxlength: 1200, default: '' },
    summaryAr: { type: String, trim: true, maxlength: 1200, default: '' },
    strengthKeys: { type: [String], default: [] },
    focusKeys: { type: [String], default: [] },
    goals: { type: [goalVersionSchema], default: [] },
    sourceReviewIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SupportReview' }],
    sourceSurveyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SupportSurvey' }],
    studentEvidenceIncluded: { type: Boolean, default: false },
    staffOnly: { type: Boolean, default: false },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    generatedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

supportPlanVersionSchema.plugin(tenantIsolationPlugin);
supportPlanVersionSchema.index({ school: 1, plan: 1, version: 1 }, { unique: true });
supportPlanVersionSchema.index({ school: 1, student: 1, publishedAt: -1 });

export default mongoose.model('SupportPlanVersion', supportPlanVersionSchema);
