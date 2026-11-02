import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const readingProgressStateSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'ReadingAssignment', required: true },
    text: { type: mongoose.Schema.Types.ObjectId, ref: 'SimplifiedText', required: true },
    readStartedAt: { type: Date, default: Date.now },
    readFinishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

readingProgressStateSchema.index({ school: 1, student: 1, assignment: 1 }, { unique: true });
readingProgressStateSchema.plugin(tenantIsolationPlugin);

const ReadingProgressState = mongoose.model('ReadingProgressState', readingProgressStateSchema);
export default ReadingProgressState;
