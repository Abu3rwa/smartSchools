import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { gameItemSchema } from './GamePack.js';

const gameAssignmentSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Teacher',
        required: true
    },
    pack: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GamePack',
        required: true
    },
    // The revision that was live when the assignment was created. Sessions
    // read content from this revision only.
    packRevisionVersion: {
        type: Number,
        required: true
    },
    // Pinned copy of the published items. Editing or republishing the pack
    // later cannot change what this assignment serves.
    items: {
        type: [gameItemSchema],
        default: []
    },
    mode: {
        type: String,
        enum: ['practice', 'quiz'],
        default: 'practice'
    },
    // Class recipients are resolved to student accounts at creation so a
    // later roster change cannot silently add or remove players.
    classIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class'
    }],
    studentIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student'
    }],
    settings: {
        shuffle: { type: Boolean, default: true },
        itemCount: { type: Number, min: 1, max: 100, default: 10 },
        attemptsAllowed: { type: Number, min: 1, max: 5, default: 1 },
        showAnswersAfter: { type: Boolean, default: true },
        timePerItemSec: { type: Number, min: 0, max: 300, default: 0 },
        dueDate: { type: Date, default: null }
    },
    status: {
        type: String,
        enum: ['open', 'closed'],
        default: 'open'
    }
}, { timestamps: true });

gameAssignmentSchema.plugin(tenantIsolationPlugin);
gameAssignmentSchema.index({ school: 1, teacher: 1, status: 1, createdAt: -1 });
gameAssignmentSchema.index({ school: 1, studentIds: 1, status: 1 });

export default mongoose.model('GameAssignment', gameAssignmentSchema);
