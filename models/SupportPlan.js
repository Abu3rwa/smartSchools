import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const taskSchema = new mongoose.Schema({
    id: { type: String, required: true, trim: true, maxlength: 24 },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    titleAr: { type: String, trim: true, maxlength: 240, default: '' },
    note: { type: String, trim: true, maxlength: 400, default: '' },
    noteAr: { type: String, trim: true, maxlength: 400, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dueDate: { type: Date, default: null },
}, { _id: false });

const goalSchema = new mongoose.Schema({
    id: { type: String, required: true, trim: true, maxlength: 24 },
    concern: { type: String, trim: true, maxlength: 30, default: '' },
    domain: { type: String, enum: ['academic', 'character'], default: 'academic' },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    subjectName: { type: String, trim: true, maxlength: 120, default: '' },
    sourceRole: {
        type: String,
        enum: ['homeroom', 'teacher', 'counselor', 'parent', 'student', 'mixed', ''],
        default: '',
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    titleAr: { type: String, trim: true, maxlength: 200, default: '' },
    description: { type: String, trim: true, maxlength: 600, default: '' },
    descriptionAr: { type: String, trim: true, maxlength: 600, default: '' },
    successLook: { type: String, trim: true, maxlength: 400, default: '' },
    successLookAr: { type: String, trim: true, maxlength: 400, default: '' },
    homeTasks: { type: [taskSchema], default: [] },
    classTasks: { type: [taskSchema], default: [] },
}, { _id: false });

const supportPlanSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportCase', default: null },
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportCycle', default: null },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    academicYear: { type: String, required: true, trim: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    version: { type: Number, default: 1, min: 1 },
    currentVersion: { type: Number, default: 0, min: 0 },
    status: {
        type: String,
        enum: ['draft', 'approved', 'published', 'closed'],
        default: 'draft',
    },
    headline: { type: String, trim: true, maxlength: 200, default: '' },
    headlineAr: { type: String, trim: true, maxlength: 200, default: '' },
    summary: { type: String, trim: true, maxlength: 1200, default: '' },
    summaryAr: { type: String, trim: true, maxlength: 1200, default: '' },
    staffOnly: { type: Boolean, default: false },
    strengthKeys: [{ type: String, trim: true, maxlength: 30 }],
    focusKeys: [{ type: String, trim: true, maxlength: 30 }],
    teacherCount: { type: Number, default: 0, min: 0 },
    parentCount: { type: Number, default: 0, min: 0 },
    goals: { type: [goalSchema], default: [] },
    sourceSurveyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SupportSurvey' }],
    aiModel: { type: String, trim: true, default: '' },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    generatedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

supportPlanSchema.plugin(tenantIsolationPlugin);
supportPlanSchema.index(
    { school: 1, cycle: 1 },
    { unique: true, partialFilterExpression: { cycle: { $type: 'objectId' } } },
);
supportPlanSchema.index(
    { school: 1, case: 1, academicYear: 1, month: 1 },
    { unique: true, partialFilterExpression: { case: { $type: 'objectId' } } },
);
supportPlanSchema.index({ school: 1, student: 1, academicYear: 1, month: 1 });
supportPlanSchema.index({ school: 1, class: 1, status: 1 });

export default mongoose.model('SupportPlan', supportPlanSchema);
