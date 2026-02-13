import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const readingCompletionSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'ReadingAssignment', required: true },
    text: { type: mongoose.Schema.Types.ObjectId, ref: 'SimplifiedText', required: true },
    correctCount: { type: Number, required: true },
    totalCount: { type: Number, required: true },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

readingCompletionSchema.index({ school: 1, student: 1, assignment: 1 }, { unique: true });
readingCompletionSchema.plugin(tenantIsolationPlugin);

const ReadingCompletion = mongoose.model('ReadingCompletion', readingCompletionSchema);
export default ReadingCompletion;
