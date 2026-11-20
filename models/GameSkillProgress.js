import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const recentEventSchema = new mongoose.Schema({
    itemId: { type: String, trim: true },
    correct: { type: Boolean },
    firstAttempt: { type: Boolean },
    at: { type: Date }
}, { _id: false });

// Recent practice evidence per skill. Evidence is never a mastery claim:
// reports show denominators, distinct items, and first-attempt results.
const gameSkillProgressSchema = new mongoose.Schema({
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
    skillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameSkill',
        required: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    correct: {
        type: Number,
        default: 0
    },
    firstAttemptCorrect: {
        type: Number,
        default: 0
    },
    distinctItems: {
        type: Number,
        default: 0
    },
    recentItemIds: {
        type: [String],
        default: []
    },
    recent: {
        type: [recentEventSchema],
        default: []
    },
    lastPracticedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

gameSkillProgressSchema.plugin(tenantIsolationPlugin);
gameSkillProgressSchema.index({ school: 1, student: 1, skillId: 1 }, { unique: true });
gameSkillProgressSchema.index({ school: 1, skillId: 1, lastPracticedAt: -1 });

export default mongoose.model('GameSkillProgress', gameSkillProgressSchema);
