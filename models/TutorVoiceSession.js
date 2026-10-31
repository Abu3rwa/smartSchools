import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const voiceBlockSchema = new mongoose.Schema({
    // bullets | contrast | example | steps | keyIdea
    type: { type: String, required: true },
    text: { type: String, default: '' },
    // bullets and steps hold strings; contrast holds { word, text }.
    items: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { _id: false });

const voiceMessageSchema = new mongoose.Schema({
    role: { type: String, enum: ['student', 'tutor'], required: true },
    text: { type: String, default: '' },
    spoken: { type: String, default: '' },
    lead: { type: String, default: '' },
    emphasis: { type: String, default: '' },
    blocks: { type: [voiceBlockSchema], default: [] },
    points: [{ type: String }],
    followUp: { type: String, default: '' },
    stage: { type: String, default: '' },
    lessonIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TutorLesson' }],
    tokens: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    transcriptSeconds: { type: Number, default: 0 },
    speechSeconds: { type: Number, default: 0 },
    at: { type: Date, default: Date.now }
}, { _id: false });

/**
 * One spoken lesson session. The board is not stored separately: it is the
 * message list, so a replay always matches what the student heard.
 */
const tutorVoiceSessionSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
        subjectName: { type: String, trim: true, default: '' },
        lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'TutorLesson' },
        lessonLabel: { type: String, trim: true, default: '' },
        classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
        grade: { type: Number },
        language: { type: String, enum: ['en', 'ar'], default: 'en' },
        languageLevel: { type: String, enum: ['support', 'on_level', 'stretch'], default: 'on_level' },
        status: { type: String, enum: ['active', 'ended'], default: 'active' },
        startedAt: { type: Date, default: Date.now },
        endedAt: { type: Date },
        messageCount: { type: Number, default: 0 },
        creditsSpent: { type: Number, default: 0 },
        providerCostCents: { type: Number, default: 0 },
        chargedCents: { type: Number, default: 0 },
        profitCents: { type: Number, default: 0 },
        messages: [voiceMessageSchema]
    },
    { timestamps: true }
);

tutorVoiceSessionSchema.index({ school: 1, student: 1, createdAt: -1 });
tutorVoiceSessionSchema.index({ school: 1, student: 1, status: 1 });
tutorVoiceSessionSchema.plugin(tenantIsolationPlugin);

const TutorVoiceSession = mongoose.model('TutorVoiceSession', tutorVoiceSessionSchema);
export default TutorVoiceSession;
