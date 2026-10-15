import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const simplifiedTextSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isShared: { type: Boolean, default: false },
    title: { type: String, trim: true, required: true },
    originalText: { type: String, required: true },
    sourceDocument: { type: String, trim: true },
    originalComplexity: { type: Number },
    language: { type: String, trim: true, lowercase: true },
    requestedLanguages: [{ type: String, trim: true, lowercase: true }],
    subjectArea: { type: String, trim: true },
    topicTags: [{ type: String, trim: true }],
    // Critical thinking questions (important for deep comprehension)
    criticalThinkingQuestions: [
      {
        question: { type: String, trim: true, required: true },
        prompt: { type: String, trim: true },
        type: { type: String, enum: ["short_answer"], default: "short_answer" },
        order: { type: Number, default: 0 },
      },
    ],
    // Comprehension questions for quiz (fixed or generated)
    comprehensionQuestions: [
      {
        question: { type: String, trim: true, required: true },
        type: { type: String, enum: ["multiple_choice", "true_false"], default: "multiple_choice" },
        options: [{ type: String, trim: true }],
        correctIndex: { type: Number, min: 0 },
        order: { type: Number, default: 0 },
      },
    ],
    simplifiedVersions: [
      {
        targetLevel: { type: Number, required: true },
        simplifiedText: { type: String, required: true },
        vocabularySubstitutions: [
          { original: { type: String, trim: true }, simple: { type: String, trim: true }, definition: { type: String, trim: true } },
        ],
        conceptsPreserved: [{ type: String, trim: true }],
      },
    ],
  },
  { timestamps: true }
);

simplifiedTextSchema.index({ school: 1, subjectArea: 1 });
simplifiedTextSchema.index({ school: 1, title: 1 });
simplifiedTextSchema.plugin(tenantIsolationPlugin);

const SimplifiedText = mongoose.model('SimplifiedText', simplifiedTextSchema);
export default SimplifiedText;
