import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

export const SUPPORT_QUESTION_AUDIENCES = ['teacher', 'parent', 'student'];
export const SUPPORT_QUESTION_STATUSES = ['draft', 'approved', 'retired'];
export const SUPPORT_QUESTION_KINDS = ['scale', 'choice', 'text'];
export const SUPPORT_STAGES = ['kg', 'primary', 'middle', 'high'];

const supportQuestionSchema = new mongoose.Schema({
    // null = platform-owned curated question, available to every school.
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
    ref: { type: String, required: true, trim: true, maxlength: 48 },
    version: { type: Number, default: 1, min: 1 },
    audience: { type: String, enum: SUPPORT_QUESTION_AUDIENCES, required: true },
    concern: { type: String, trim: true, maxlength: 30, default: '' },
    domain: { type: String, enum: ['academic', 'character', 'general'], default: 'general' },
    kind: { type: String, enum: SUPPORT_QUESTION_KINDS, default: 'scale' },
    scaleMax: { type: Number, min: 2, max: 5, default: 4 },
    prompt: { type: String, required: true, trim: true, maxlength: 500 },
    promptAr: { type: String, required: true, trim: true, maxlength: 500 },
    options: { type: [String], default: [] },
    optionsAr: { type: [String], default: [] },
    anchors: { type: [String], default: [] },
    anchorsAr: { type: [String], default: [] },
    required: { type: Boolean, default: true },
    allowComment: { type: Boolean, default: false },
    // Diagnosis-style items are never turned into a numeric severity score.
    scored: { type: Boolean, default: true },
    diagnostic: { type: Boolean, default: false },
    // Fixed comparable question asked every review when it is selected.
    trendAnchor: { type: Boolean, default: false },
    // Curated follow-ups may only replace a question for these concerns.
    followUpFor: { type: [String], default: [] },
    stages: { type: [String], enum: SUPPORT_STAGES, default: [] },
    status: { type: String, enum: SUPPORT_QUESTION_STATUSES, default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    retiredAt: { type: Date, default: null },
}, { timestamps: true });

supportQuestionSchema.plugin(tenantIsolationPlugin);
supportQuestionSchema.index({ school: 1, ref: 1, version: 1 }, { unique: true });
supportQuestionSchema.index({ audience: 1, status: 1 });
supportQuestionSchema.index({ school: 1, audience: 1, status: 1 });

export default mongoose.model('SupportQuestion', supportQuestionSchema);
