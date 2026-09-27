import mongoose from 'mongoose';

const dictionaryEntrySchema = new mongoose.Schema({
    word: { type: String, required: true, unique: true, lowercase: true, trim: true },
    audioUrl: { type: String, default: '' },
    phonetic: { type: String, default: '' },
    definitions: [{
        _id: false,
        partOfSpeech: { type: String, default: '' },
        definition: { type: String, default: '' },
        example: { type: String, default: '' }
    }],
    fetchedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['found', 'not-found', 'fetch-failed'], required: true }
}, { timestamps: true, suppressReservedKeysWarning: true });

dictionaryEntrySchema.index({ word: 1 }, { unique: true });
export default mongoose.model('DictionaryEntry', dictionaryEntrySchema);
