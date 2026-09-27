import mongoose from 'mongoose';
import { DEFAULT_SPELLING_EMAIL_AUDIENCE, SPELLING_EMAIL_AUDIENCES } from '../utils/spellingEmailSettings.js';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const spellingClassSettingsSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    defaultMaxMistakes: { type: Number, min: 1, max: 50, default: 3 },
    defaultEmailAudience: { type: String, enum: SPELLING_EMAIL_AUDIENCES, default: DEFAULT_SPELLING_EMAIL_AUDIENCE },
    dictationMode: {
        enabled: { type: Boolean, default: false },
        autoPlayOnShow: { type: Boolean, default: true }
    },
    passageGeneration: {
        enabled: { type: Boolean, default: false },
        trigger: { type: String, enum: ['manual', 'automatic'], default: 'manual' },
        style: { type: String, enum: ['passage', 'sentence-list'], default: 'sentence-list' },
        requireTeacherApproval: { type: Boolean, default: true },
        passageEmailAudience: { type: String, enum: SPELLING_EMAIL_AUDIENCES, default: 'none' }
    }
}, { timestamps: true, suppressReservedKeysWarning: true });

spellingClassSettingsSchema.index({ school: 1, class: 1 }, { unique: true });
spellingClassSettingsSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SpellingClassSettings', spellingClassSettingsSchema);
