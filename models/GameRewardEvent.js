import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// One trusted award. The unique key makes retries and duplicate requests
// incapable of granting XP twice.
const gameRewardEventSchema = new mongoose.Schema({
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
    source: {
        type: String,
        enum: ['practice', 'writing', 'correction', 'review', 'leaderboard'],
        required: true
    },
    ruleKey: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    // Null = General. Older events carry no dimensions: they count on the
    // school board only, never on a class or subject board.
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        default: null
    },
    classes: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Class',
        default: []
    },
    dayKey: {
        type: String,
        trim: true,
        maxlength: 10,
        default: ''
    },
    attempts: {
        type: Number,
        default: 0,
        min: 0
    },
    correct: {
        type: Number,
        default: 0,
        min: 0
    },
    uniqueKey: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160
    }
}, { timestamps: true });

gameRewardEventSchema.plugin(tenantIsolationPlugin);
gameRewardEventSchema.index({ school: 1, uniqueKey: 1 }, { unique: true });
gameRewardEventSchema.index({ school: 1, student: 1, createdAt: -1 });
gameRewardEventSchema.index({ school: 1, subject: 1, createdAt: 1 });
gameRewardEventSchema.index({ school: 1, classes: 1, createdAt: 1 });
gameRewardEventSchema.index({ school: 1, student: 1, subject: 1, dayKey: 1 });

export default mongoose.model('GameRewardEvent', gameRewardEventSchema);
