import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const readingAnswerDraftSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'ReadingAssignment', required: true },
    text: { type: mongoose.Schema.Types.ObjectId, ref: 'SimplifiedText', required: true },
    answers: { type: Map, of: String, default: {} },
  },
  { timestamps: true }
);

readingAnswerDraftSchema.index({ school: 1, student: 1, assignment: 1 }, { unique: true });
// Drafts are working copies; the TTL keeps abandoned ones from accumulating.
readingAnswerDraftSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
readingAnswerDraftSchema.plugin(tenantIsolationPlugin);

const ReadingAnswerDraft = mongoose.model('ReadingAnswerDraft', readingAnswerDraftSchema);
export default ReadingAnswerDraft;
