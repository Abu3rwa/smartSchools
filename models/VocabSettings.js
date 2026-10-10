import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// Feature switch and tunables for Vocabulary Practice, one document per school. Disabled until a teacher turns it on.
const vocabSettingsSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    enabled: { type: Boolean, default: false },
    masteryThreshold: { type: Number, default: 2, min: 1, max: 10 },
    inactivityDays: { type: Number, default: 7, min: 1, max: 90 },
    showDictionaryText: { type: Boolean, default: true }
}, { timestamps: true });

vocabSettingsSchema.index({ school: 1 }, { unique: true });
vocabSettingsSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('VocabSettings', vocabSettingsSchema);
