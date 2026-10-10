import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const vocabMcqSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    questionId: { type: String, required: true, trim: true, maxlength: 64 },
    scopeAll: { type: Boolean, default: false },
    listIds: { type: [String], default: [] },
    word: { type: mongoose.Schema.Types.ObjectId, ref: 'VocabWord', default: null },
    question: { type: String, required: true, trim: true, maxlength: 1000 },
    // Original order is stored; students see a shuffled copy.
    options: [{ _id: false, key: { type: String, enum: ['A', 'B', 'C', 'D'] }, text: { type: String, trim: true, maxlength: 500 } }],
    correct: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
    explanation: { type: String, default: '', trim: true, maxlength: 1000 }
}, { timestamps: true });

vocabMcqSchema.index({ school: 1, questionId: 1 }, { unique: true });
vocabMcqSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('VocabMcq', vocabMcqSchema);
