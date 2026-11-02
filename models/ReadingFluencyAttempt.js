import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const readingFluencyAttemptSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'ReadingAssignment', required: true },
    text: { type: mongoose.Schema.Types.ObjectId, ref: 'SimplifiedText', required: true },
    blockKey: { type: String, trim: true, required: true },
    level: { type: Number, default: null },
    textHash: { type: String, trim: true, default: '' },
    refWordCount: { type: Number, default: 0 },
    attemptNumber: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ['scored', 'not_heard', 'failed'],
      default: 'scored'
    },
    notHeardReason: {
      type: String,
      enum: ['hallucination', 'silence', 'too_short', 'low_alignment', null],
      default: null
    },
    counted: { type: Boolean, default: false },
    recordedSec: { type: Number, default: 0 },
    spokenSec: { type: Number, default: 0 },
    wordsAttempted: { type: Number, default: 0 },
    wordsCorrect: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
    insertions: { type: Number, default: 0 },
    selfCorrections: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    completion: { type: Number, default: 0 },
    wpm: { type: Number, default: null },
    longPauses: { type: Number, default: 0 },
    longestPauseSec: { type: Number, default: 0 },
    statusMap: { type: String, default: '' },
    issues: [{
      _id: false,
      i: { type: Number, required: true },
      heard: { type: String, trim: true, maxlength: 200, default: '' }
    }],
    pauses: [{
      _id: false,
      after: { type: Number, default: null },
      sec: { type: Number, required: true }
    }],
    transcript: { type: String, maxlength: 6000, default: '' },
    transcriptPurgedAt: { type: Date, default: null },
    sttModel: { type: String, trim: true, default: '' },
    costCents: { type: Number, default: 0 },
    chargeFailed: { type: Boolean, default: false },
    idempotencyKey: { type: String, trim: true, required: true, maxlength: 120 }
  },
  { timestamps: true }
);

readingFluencyAttemptSchema.index(
  { school: 1, student: 1, assignment: 1, blockKey: 1, attemptNumber: 1 },
  { unique: true }
);
readingFluencyAttemptSchema.index({ school: 1, idempotencyKey: 1 }, { unique: true });
readingFluencyAttemptSchema.index({ school: 1, assignment: 1, student: 1 });
readingFluencyAttemptSchema.index({ school: 1, student: 1, createdAt: -1 });
// The retention sweep scans by age across every school.
readingFluencyAttemptSchema.index({ transcriptPurgedAt: 1, createdAt: 1 });
readingFluencyAttemptSchema.plugin(tenantIsolationPlugin);

const ReadingFluencyAttempt = mongoose.model(
  'ReadingFluencyAttempt',
  readingFluencyAttemptSchema
);
export default ReadingFluencyAttempt;
