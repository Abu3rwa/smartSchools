import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// Per-class switches for SkillPath. A missing document means the default
// (leaderboard on), so classes never need a setup step.
const gameClassSettingSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    leaderboardEnabled: {
        type: Boolean,
        default: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, { timestamps: true });

gameClassSettingSchema.plugin(tenantIsolationPlugin);
gameClassSettingSchema.index({ school: 1, class: 1 }, { unique: true });

export default mongoose.model('GameClassSetting', gameClassSettingSchema);