import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const supportQuestionSchema = new mongoose.Schema({
    id: { type: String, required: true, trim: true, maxlength: 32 },
    key: { type: String, required: true, trim: true, maxlength: 80 },
    domain: { type: String, enum: ['academic', 'character', 'general'], default: 'general' },
    prompt: { type: String, required: true, trim: true, maxlength: 500 },
    promptAr: { type: String, trim: true, maxlength: 500, default: '' },
    kind: { type: String, enum: ['scale', 'choice', 'text'], default: 'scale' },
    scaleMax: { type: Number, min: 2, max: 5, default: 4 },
    options: [{ type: String, trim: true, maxlength: 160 }],
    optionsAr: [{ type: String, trim: true, maxlength: 160 }],
    anchors: [{ type: String, trim: true, maxlength: 80 }],
    anchorsAr: [{ type: String, trim: true, maxlength: 80 }],
    required: { type: Boolean, default: true },
    allowComment: { type: Boolean, default: false },
}, { _id: false });

const supportAnswerSchema = new mongoose.Schema({
    questionId: { type: String, required: true, trim: true, maxlength: 32 },
    scaleValue: { type: Number, min: 1, max: 5, default: null },
    choiceIndex: { type: Number, min: 0, max: 9, default: null },
    choiceValue: { type: String, trim: true, maxlength: 160, default: '' },
    textValue: { type: String, trim: true, maxlength: 1000, default: '' },
    answeredAt: { type: Date, default: Date.now },
}, { _id: false });

const supportSurveySchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportCycle', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    audience: { type: String, enum: ['teacher', 'parent'], default: 'teacher' },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        default: null,
        required: function required() { return this.audience === 'teacher'; },
    },
    respondent: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportRespondent', required: true },
    round: { type: Number, default: 1, min: 1 },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    dueDate: { type: Date, default: null },
    status: {
        type: String,
        enum: ['draft', 'sent', 'opened', 'submitted'],
        default: 'draft',
    },
    questionSource: { type: String, enum: ['fixed', 'library', 'ai'], default: 'fixed' },
    aiModel: { type: String, default: '', trim: true },
    questions: { type: [supportQuestionSchema], default: [] },
    answers: { type: [supportAnswerSchema], default: [] },
    sentAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    lastSavedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    reminderCount: { type: Number, default: 0, min: 0 },
    lastReminderAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

supportSurveySchema.plugin(tenantIsolationPlugin);
supportSurveySchema.index(
    { school: 1, cycle: 1, respondent: 1, audience: 1, subject: 1 },
    { unique: true },
);
supportSurveySchema.index({ school: 1, student: 1, cycle: 1, status: 1 });
supportSurveySchema.index({ school: 1, respondent: 1, status: 1, dueDate: 1 });
supportSurveySchema.index({ school: 1, cycle: 1, status: 1 });

export default mongoose.model('SupportSurvey', supportSurveySchema);
