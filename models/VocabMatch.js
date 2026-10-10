import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const vocabMatchSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    setId: { type: String, required: true, trim: true, maxlength: 64 },
    scopeAll: { type: Boolean, default: false },
    listIds: { type: [String], default: [] },
    instruction: { type: String, default: '', trim: true, maxlength: 500 },
    // Pair order is the answer key; students see the right-hand side shuffled.
    pairs: [{ _id: false, left: { type: String, trim: true, maxlength: 300 }, right: { type: String, trim: true, maxlength: 300 } }]
}, { timestamps: true });

vocabMatchSchema.index({ school: 1, setId: 1 }, { unique: true });
vocabMatchSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('VocabMatch', vocabMatchSchema);
