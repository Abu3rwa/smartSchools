import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// Teacher-issued recognition notes. They carry no XP — rewards acknowledge
// effort, the leaderboard ranks practice.
const gameTeacherRewardSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
        class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
        issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        note: { type: String, required: true, trim: true, maxlength: 300 },
        periodType: { type: String, enum: ['week', 'month', 'custom'], default: 'custom' },
        periodKey: { type: String, trim: true, maxlength: 20, default: '' }
    },
    { timestamps: true }
);

gameTeacherRewardSchema.index({ school: 1, student: 1, createdAt: -1 });
gameTeacherRewardSchema.index({ school: 1, class: 1, createdAt: -1 });

gameTeacherRewardSchema.plugin(tenantIsolationPlugin);

const GameTeacherReward = mongoose.model('GameTeacherReward', gameTeacherRewardSchema);
export default GameTeacherReward;