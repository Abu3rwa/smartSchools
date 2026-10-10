import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const vocabMasterySchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    word: { type: mongoose.Schema.Types.ObjectId, ref: 'VocabWord', required: true },
    listId: { type: String, required: true },
    state: { type: String, enum: ['practicing', 'mastered'], default: 'practicing' },
    consecutiveCorrect: { type: Number, default: 0, min: 0 },
    attempts: { type: Number, default: 0, min: 0 },
    correct: { type: Number, default: 0, min: 0 },
    lastSeen: { type: Date, default: null },
    nextDue: { type: Date, default: null }
}, { timestamps: true });

vocabMasterySchema.index({ school: 1, student: 1, word: 1 }, { unique: true });
vocabMasterySchema.plugin(tenantIsolationPlugin);

export default mongoose.model('VocabMastery', vocabMasterySchema);
