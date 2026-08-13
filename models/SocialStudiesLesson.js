import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// ── Embedded question option ──────────────────────────────────────────────
const optionSchema = new mongoose.Schema(
    { label: { type: String, trim: true }, text: { type: String, trim: true } },
    { _id: false }
);

// ── Embedded question sub-schema ─────────────────────────────────────────
const questionSchema = new mongoose.Schema(
    {
        questionText: { type: String, required: true, trim: true },
        questionType: {
            type: String,
            enum: ['multiple_choice', 'true_false', 'short_answer'],
            required: true,
        },
        options: [optionSchema],
        correctAnswer: { type: String, trim: true, default: '' },
        explanation: { type: String, trim: true, default: '' },
        difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
        points: { type: Number, default: 1, min: 0 },
        topic: { type: String, trim: true, default: '' },
        isAIGenerated: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
    },
    { _id: true }
);

// ── Main lesson schema ────────────────────────────────────────────────────
const socialStudiesLessonSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
        unit: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialStudiesUnit', required: true },
        title: { type: String, required: true, trim: true, maxlength: 200 },
        estimatedDuration: { type: Number, default: null, min: 1 },
        order: { type: Number, default: 0 },
        // Single HTML string — teacher pastes AI-generated HTML directly
        content: { type: String, default: '' },
        questions: [questionSchema],
        isPublished: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

socialStudiesLessonSchema.index({ school: 1, unit: 1, order: 1 });
socialStudiesLessonSchema.index({ school: 1, teacher: 1 });
socialStudiesLessonSchema.index({ school: 1, unit: 1, isPublished: 1 });

socialStudiesLessonSchema.plugin(tenantIsolationPlugin);

const SocialStudiesLesson = mongoose.model('SocialStudiesLesson', socialStudiesLessonSchema);
export default SocialStudiesLesson;
