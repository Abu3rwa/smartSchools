import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const tutorPracticeQuestionSchema = new mongoose.Schema(
    {
        question: { type: String, required: true },
        options: { type: [String], required: true },
        correctIndex: { type: Number, required: true, min: 0 },
        explanation: { type: String, default: '' }
    },
    { _id: false }
);

const tutorPracticeAnswerSchema = new mongoose.Schema(
    {
        choiceIndex: { type: Number, required: true },
        correct: { type: Boolean, required: true }
    },
    { _id: false }
);

/**
 * A set of exam-style questions built from the same lessons the tutor answers from.
 * The answer key lives here only; the student receives the questions without it, and
 * marking a set is pure comparison — no AI runs while a student answers.
 */
const tutorPracticeSetSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
        subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
        grade: { type: Number, required: true },
        lessonIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TutorLesson' }],
        status: { type: String, enum: ['open', 'submitted'], default: 'open' },
        questions: { type: [tutorPracticeQuestionSchema], default: [] },
        answers: { type: [tutorPracticeAnswerSchema], default: [] },
        score: { type: Number, default: null },
        submittedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

tutorPracticeSetSchema.index({ school: 1, student: 1, createdAt: -1 });

tutorPracticeSetSchema.plugin(tenantIsolationPlugin);

const TutorPracticeSet = mongoose.model('TutorPracticeSet', tutorPracticeSetSchema);
export default TutorPracticeSet;
