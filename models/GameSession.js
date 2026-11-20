import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { gameItemSchema } from './GamePack.js';

// One play-through. The item snapshot (including answer rules) is pinned at
// start, so publishing a newer revision cannot change what a student sees or
// how an answer is scored mid-session.
const gameSessionSchema = new mongoose.Schema({
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
    packRevisionVersion: {
        type: Number,
        required: true
    },
    mode: {
        type: String,
        enum: ['practice', 'quiz'],
        default: 'practice'
    },
    showAnswersAfter: {
        type: Boolean,
        default: true
    },
    items: {
        type: [gameItemSchema],
        default: []
    },
    answeredCount: {
        type: Number,
        default: 0
    },
    correctCount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['in_progress', 'completed'],
        default: 'in_progress'
    },
    completedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

gameSessionSchema.plugin(tenantIsolationPlugin);
gameSessionSchema.index({ school: 1, student: 1, status: 1, createdAt: -1 });
gameSessionSchema.index({ school: 1, assignment: 1, student: 1 });

export default mongoose.model('GameSession', gameSessionSchema);
