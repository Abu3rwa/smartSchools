import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { WORD_FORMS } from '../utils/vocabCsv.js';

const vocabWordSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    listId: { type: String, required: true, trim: true, uppercase: true },
    word: { type: String, required: true, trim: true, maxlength: 120 },
    normalizedWord: { type: String, required: true, trim: true, maxlength: 120 },
    partOfSpeech: { type: [String], enum: ['n', 'v', 'adj', 'adv'], validate: (value) => value.length > 0 },
    posKey: { type: String, required: true },
    form: { type: String, enum: ['', ...WORD_FORMS], default: '' },
    baseWord: { type: String, default: '', trim: true, maxlength: 120 },
    exampleSentence: { type: String, default: '', trim: true, maxlength: 1000 },
    meaning: { type: String, default: '', trim: true, maxlength: 1000 },
    arabicMeaning: { type: String, default: '', trim: true, maxlength: 1000 },
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    verified: { type: Boolean, default: false }
}, { timestamps: true });

vocabWordSchema.index({ school: 1, listId: 1, normalizedWord: 1, posKey: 1 }, { unique: true });
vocabWordSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('VocabWord', vocabWordSchema);
