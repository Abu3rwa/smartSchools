import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// One reward profile for games and linked writing. XP recognises practice;
// it is not a grade, a streak is not attendance, and neither is mastery.
const gameProfileSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    xp: {
        type: Number,
        default: 0,
        min: 0
    },
    badges: {
        type: [String],
        default: []
    },
    // Recent qualifying practice days (school timezone), oldest first.
    practiceDays: {
        type: [String],
        default: []
    },
    weeklyGoalDays: {
        type: Number,
        default: 3
    },
    lastQualifiedWeek: {
        type: String,
        default: ''
    },
    streakWeeks: {
        type: Number,
        default: 0
    },
    longestStreakWeeks: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

gameProfileSchema.plugin(tenantIsolationPlugin);
gameProfileSchema.index({ school: 1, student: 1 }, { unique: true });

export default mongoose.model('GameProfile', gameProfileSchema);
