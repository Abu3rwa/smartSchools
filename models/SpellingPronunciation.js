import mongoose from 'mongoose';

// Global (not school-scoped): one generated clip serves every school that uses the word.
// The bytes are ours; the dictionary URL never becomes the source of truth.
const spellingPronunciationSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    publicId: { type: String, required: true, unique: true, index: true },
    word: { type: String, required: true, trim: true, maxlength: 200 },
    accent: { type: String, enum: ['us', 'uk'], required: true },
    model: { type: String, required: true },
    voice: { type: String, required: true },
    instructions: { type: String, default: '' },
    contentType: { type: String, default: 'audio/mpeg' },
    speechSeconds: { type: Number, default: 0 },
    // A removed clip keeps its key so bulk generation never recreates it; only an
    // explicit admin regenerate clears this and mints a new publicId.
    removedAt: { type: Date, default: null },
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Review state. The clip is shared by every school, so the verdict is stored
    // on the clip: one school's admin reviews it and nobody repeats the work.
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Regenerations of this clip. New bytes are never reviewed, so the word
    // goes back into the queue until somebody listens again.
    reviewAttempts: { type: Number, default: 0, min: 0 },
    // A "this clip is broken" report. Teachers cannot spend the school's AI
    // credits, so they flag and an admin regenerates.
    flaggedAt: { type: Date, default: null },
    flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    flagReason: { type: String, enum: ['silent', 'unclear', 'wrong', null], default: null },
    data: { type: Buffer, required: true, select: false }
}, { timestamps: true, collection: 'spellingPronunciations' });

export default mongoose.model('SpellingPronunciation', spellingPronunciationSchema);
