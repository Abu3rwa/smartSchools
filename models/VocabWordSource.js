import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const vocabWordSourceSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    word: { type: mongoose.Schema.Types.ObjectId, ref: 'VocabWord', required: true },
    source: { type: String, enum: ['oxford', 'longman', 'webster'], required: true },
    definitionText: { type: String, default: '', trim: true, maxlength: 3000 },
    pageUrl: { type: String, default: '', trim: true, maxlength: 1000 },
    audioUsUrl: { type: String, default: '', trim: true, maxlength: 1000 },
    audioUkUrl: { type: String, default: '', trim: true, maxlength: 1000 },
    exampleAudioUrl: { type: String, default: '', trim: true, maxlength: 1000 }
}, { timestamps: true });

vocabWordSourceSchema.index({ school: 1, word: 1, source: 1 }, { unique: true });
vocabWordSourceSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('VocabWordSource', vocabWordSourceSchema);
