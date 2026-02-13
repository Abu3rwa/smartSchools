import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const simplifiedTextSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    title: { type: String, trim: true, required: true },
    originalText: { type: String, required: true },
    sourceDocument: { type: String, trim: true },
    originalComplexity: { type: Number },
    subjectArea: { type: String, trim: true },
    topicTags: [{ type: String, trim: true }],
    // Critical thinking questions (important for deep comprehension)
    criticalThinkingQuestions: [
      {
        question: { type: String, trim: true, required: true },
        prompt: { type: String, trim: true },
        order: { type: Number, default: 0 },
      },
    ],
    // Comprehension questions for quiz (fixed or generated)
    comprehensionQuestions: [
      {
        question: { type: String, trim: true, required: true },
        options: [{ type: String, trim: true }],
        correctIndex: { type: Number, required: true },
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
