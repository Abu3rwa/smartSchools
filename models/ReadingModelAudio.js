import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const readingModelAudioSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    text: { type: mongoose.Schema.Types.ObjectId, ref: 'SimplifiedText', required: true },
    blockKey: { type: String, trim: true, required: true },
    level: { type: Number, default: null },
    textHash: { type: String, trim: true, required: true },
    voice: { type: String, trim: true, default: '' },
    model: { type: String, trim: true, default: '' },
    contentType: { type: String, trim: true, default: 'audio/mpeg' },
    speechSeconds: { type: Number, default: 0 },
    wordTimes: { type: [[Number]], default: [] },
    data: { type: Buffer, required: true, select: false }
  },
  { timestamps: true }
);

readingModelAudioSchema.index(
  { school: 1, text: 1, blockKey: 1, level: 1, textHash: 1 },
  { unique: true }
);
readingModelAudioSchema.plugin(tenantIsolationPlugin);

const ReadingModelAudio = mongoose.model('ReadingModelAudio', readingModelAudioSchema);
export default ReadingModelAudio;
