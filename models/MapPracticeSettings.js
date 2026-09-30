import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const mapPracticeSettingsSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
    feedbackMode: { type: String, enum: ['instant', 'after_submit', 'after_review'], default: 'after_submit' },
    selfPracticeEnabled: { type: Boolean, default: true },
    showTimer: { type: Boolean, default: false },
    lowAccuracyThreshold: { type: Number, min: 0, max: 100, default: 60 },
    minAnswersForAccuracy: { type: Number, min: 1, max: 100, default: 3 },
    noActivityDays: { type: Number, min: 1, max: 365, default: 7 },
    partialCreditMultiSelect: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

mapPracticeSettingsSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPracticeSettings', mapPracticeSettingsSchema);
