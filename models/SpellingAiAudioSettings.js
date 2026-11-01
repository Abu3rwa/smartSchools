import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// One document per school. Missing means OFF: the platform switch is still the outer gate.
const spellingAiAudioSettingsSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    wordAudioEnabled: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

spellingAiAudioSettingsSchema.index({ school: 1 }, { unique: true });
spellingAiAudioSettingsSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SpellingAiAudioSettings', spellingAiAudioSettingsSchema);
