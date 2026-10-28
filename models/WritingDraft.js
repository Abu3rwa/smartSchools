import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const draftSectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    index: { type: Number, default: 0 },
    label: { type: String, trim: true, default: '' },
    text: { type: String, default: '' },
    words: { type: Number, default: 0 }
  },
  { _id: false }
);

/**
 * A submitted version of a student's writing. Created once, never edited:
 * every later revision is stored as the next `number` for the same project.
 */
const writingDraftSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingProject', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'WritingAssignment', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    number: { type: Number, required: true, min: 1 },
    title: { type: String, trim: true, default: '' },
    sections: { type: [draftSectionSchema], default: [] },
    totalWords: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
    submissionSource: { type: String, enum: ['student', 'teacher'], default: 'student' },
    configSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    }
  },
  { timestamps: true }
);

writingDraftSchema.index({ school: 1, project: 1, number: 1 }, { unique: true });
writingDraftSchema.index({ school: 1, student: 1, submittedAt: -1 });
writingDraftSchema.plugin(tenantIsolationPlugin);

const WritingDraft = mongoose.model('WritingDraft', writingDraftSchema);
export default WritingDraft;
