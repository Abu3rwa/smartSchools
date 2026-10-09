import mongoose from 'mongoose';

const urlField = { type: String, trim: true, maxlength: 500 };
const urlList = { type: [{ type: String, trim: true, maxlength: 500 }], default: undefined };

// Global (not school-scoped): URLs are public dictionary links shared by every grade that uses the word.
const wordAudioSchema = new mongoose.Schema({
    word: { type: String, required: true, unique: true, trim: true, maxlength: 200 },
    longmanUS: urlField,
    longmanUK: urlField,
    oxfordUS: urlField,
    oxfordUK: urlField,
    websterUS: urlField,
    definition: { type: String, trim: true, maxlength: 2000 },
    examples: {
        _id: false,
        longman: urlList,
        oxford: urlList,
        webster: urlList
    },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'wordAudio', versionKey: false });

export default mongoose.model('WordAudio', wordAudioSchema);
