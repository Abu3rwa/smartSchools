import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const optionSchema = new mongoose.Schema({
    key: { type: String, required: true, trim: true, maxlength: 4 },
    text: { type: String, default: '', trim: true, maxlength: 1200 }
}, { _id: false });

const mapPracticeQuestionSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticePlan', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    set: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeSet', required: true },
    questionId: { type: String, required: true, trim: true, maxlength: 180 },
    skill: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeSkill', required: true },
    subject: { type: String, default: '', trim: true, maxlength: 80 },
    strand: { type: String, default: '', trim: true, maxlength: 120 },
    ritBand: { type: String, default: '', trim: true, maxlength: 40 },
    passageId: { type: String, default: '', trim: true, maxlength: 160 },
    passageTitle: { type: String, default: '', trim: true, maxlength: 220 },
    passageText: { type: String, default: '', trim: true, maxlength: 6000 },
    questionType: { type: String, enum: ['mcq', 'multi_select', 'short_text'], required: true },
    stem: { type: String, required: true, trim: true, maxlength: 4000 },
    options: [optionSchema],
    correctAnswer: { type: String, default: '', trim: true, maxlength: 200 },
    explanation: { type: String, default: '', trim: true, maxlength: 4000 },
    distractorNote: { type: String, default: '', trim: true, maxlength: 2000 },
    points: { type: Number, default: 1, min: 0 },
    order: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    contentHash: { type: String, default: '', trim: true, maxlength: 128 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

mapPracticeQuestionSchema.index({ school: 1, plan: 1, questionId: 1 }, { unique: true });
mapPracticeQuestionSchema.index({ school: 1, student: 1, set: 1, order: 1 });
mapPracticeQuestionSchema.index({ school: 1, skill: 1, active: 1 });
mapPracticeQuestionSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPracticeQuestion', mapPracticeQuestionSchema);
