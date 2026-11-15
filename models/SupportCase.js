import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

export const SUPPORT_CASE_STATUSES = ['active', 'closed'];
export const SUPPORT_SEVERITIES = ['watch', 'support', 'intensive'];
export const SUPPORT_CASE_SOURCES = ['manual', 'parent_request', 'suggestion'];
export const SUPPORT_VOICE_MODES = ['inherit', 'on', 'off'];

const subjectScopeSchema = new mongoose.Schema({
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    name: { type: String, trim: true, maxlength: 120, default: '' },
    teachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { _id: false });

const participantSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
        type: String,
        enum: ['homeroom', 'teacher', 'counselor', 'admin', 'nurse'],
        default: 'teacher',
    },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    active: { type: Boolean, default: true },
    addedAt: { type: Date, default: Date.now },
}, { _id: false });

const noteSchema = new mongoose.Schema({
    text: { type: String, trim: true, maxlength: 2000, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
}, { _id: false });

const familyContactSchema = new mongoose.Schema({
    respondent: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportRespondent', required: true },
    slot: {
        type: String,
        enum: ['mother', 'father', 'guardian', 'other'],
        default: 'guardian',
    },
    deliveryMethod: {
        type: String,
        enum: ['email', 'printed', 'assisted', 'portal'],
        default: 'email',
    },
    email: { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
    name: { type: String, trim: true, maxlength: 120, default: '' },
    active: { type: Boolean, default: true },
    addedAt: { type: Date, default: Date.now },
}, { _id: false });

const parentRequestSchema = new mongoose.Schema({
    parentUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    parentEmail: { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
    message: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    response: { type: String, trim: true, maxlength: 600, default: '' },
    at: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const supportCaseSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    academicYear: { type: String, required: true, trim: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    homeroomTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    counselor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    nominator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, enum: SUPPORT_CASE_SOURCES, default: 'manual' },
    status: { type: String, enum: SUPPORT_CASE_STATUSES, default: 'active' },
    severity: { type: String, enum: SUPPORT_SEVERITIES, default: 'support' },
    subjects: { type: [subjectScopeSchema], default: [] },
    participants: { type: [participantSchema], default: [] },
    familyContacts: { type: [familyContactSchema], default: [] },
    currentPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportPlan', default: null },
    originCycle: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportCycle', default: null },
    concernNote: { type: String, trim: true, maxlength: 2000, default: '' },
    notes: { type: [noteSchema], default: [] },
    openRequests: { type: Number, default: 0, min: 0 },
    cadenceDays: { type: Number, default: 30, min: 1, max: 180 },
    nextReviewAt: { type: Date, default: null },
    lastReviewAt: { type: Date, default: null },
    studentVoice: { type: String, enum: SUPPORT_VOICE_MODES, default: 'inherit' },
    studentEvidenceInPlan: { type: Boolean, default: false },
    parentRequest: { type: parentRequestSchema, default: null },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closeReason: {
        type: String,
        enum: ['goal_met', 'stepped_down', 'moved_school', 'referred', 'other', ''],
        default: '',
    },
    closeSummary: { type: String, trim: true, maxlength: 1200, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

supportCaseSchema.plugin(tenantIsolationPlugin);
supportCaseSchema.index({ school: 1, student: 1, status: 1 });
supportCaseSchema.index({ school: 1, status: 1, severity: 1, nextReviewAt: 1 });
supportCaseSchema.index({ school: 1, owner: 1, status: 1 });
supportCaseSchema.index({ school: 1, class: 1, status: 1 });
supportCaseSchema.index(
    { school: 1, student: 1 },
    { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_case_per_student' },
);

export default mongoose.model('SupportCase', supportCaseSchema);
