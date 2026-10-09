import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// One document per school+grade. A missing document means the feature is OFF (the default).
const spellingAudioSettingsSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    grade: { type: String, enum: ['KG', 'G1', 'G2', 'G3', 'G4', 'G5'], required: true },
    enabled: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

spellingAudioSettingsSchema.index({ school: 1, grade: 1 }, { unique: true });
spellingAudioSettingsSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SpellingAudioSettings', spellingAudioSettingsSchema);
