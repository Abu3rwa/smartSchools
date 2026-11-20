import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// One answer to one item. This is the base unit for every report.
const gameAttemptSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameSession',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    assignment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameAssignment',
        default: null
    },
    pack: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GamePack',
        required: true
    },
    itemId: {
        type: String,
        required: true,
        trim: true
    },
    skillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameSkill',
        required: true
    },
    // Client-generated; a transport retry with the same id is the same attempt.
    submissionId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80
    },
    response: {
        type: String,
        maxlength: 2000,
        default: ''
    },
    correct: {
        type: Boolean,
        required: true
    },
    firstAttempt: {
        type: Boolean,
        default: true
    },
    answeredAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

gameAttemptSchema.plugin(tenantIsolationPlugin);
gameAttemptSchema.index({ school: 1, session: 1, itemId: 1 }, { unique: true });
gameAttemptSchema.index({ school: 1, student: 1, skillId: 1, answeredAt: -1 });
gameAttemptSchema.index({ school: 1, student: 1, answeredAt: -1 });

export default mongoose.model('GameAttempt', gameAttemptSchema);
