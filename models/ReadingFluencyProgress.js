import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const scorePairSchema = new mongoose.Schema(
  {
    _id: false,
    accuracy: { type: Number, default: null },
    wpm: { type: Number, default: null }
  },
  { _id: false }
);

const readingFluencyProgressSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'ReadingAssignment', required: true },
    blockKey: { type: String, trim: true, required: true },
    listens: { type: Number, default: 0 },
    // Server-side throttle: a burst of play taps must not inflate the count.
    lastListenAt: { type: Date, default: null },
    readings: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    first: { type: scorePairSchema, default: () => ({ accuracy: null, wpm: null }) },
    best: { type: scorePairSchema, default: () => ({ accuracy: null, wpm: null }) },
    // Fastest counted reading, tracked apart from `best` because that row keeps
    // the pace of the most accurate attempt, not the quickest one.
    bestWpm: { type: Number, default: null },
    latest: {
      accuracy: { type: Number, default: null },
      wpm: { type: Number, default: null },
      at: { type: Date, default: null }
    },
    focusWords: [{
      _id: false,
      word: { type: String, trim: true, maxlength: 120, required: true },
      misses: { type: Number, default: 1, min: 1 }
    }],
    goalMet: { type: Boolean, default: false }
  },
  { timestamps: true }
);

readingFluencyProgressSchema.index(
  { school: 1, student: 1, assignment: 1, blockKey: 1 },
  { unique: true }
);
readingFluencyProgressSchema.index({ school: 1, assignment: 1, student: 1 });
readingFluencyProgressSchema.plugin(tenantIsolationPlugin);

const ReadingFluencyProgress = mongoose.model(
  'ReadingFluencyProgress',
  readingFluencyProgressSchema
);
export default ReadingFluencyProgress;
