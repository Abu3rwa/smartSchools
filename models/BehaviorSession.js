import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const behaviorSessionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        sessionId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        startedAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        endedAt: {
            type: Date,
            default: null
        },
        lastSeenAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        durationSeconds: {
            type: Number,
            min: 0,
            default: 0
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        ipAddress: {
            type: String
        },
        userAgent: {
            type: String,
            maxlength: 500
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

behaviorSessionSchema.index({ school: 1, isActive: 1, lastSeenAt: -1 });
behaviorSessionSchema.index({ user: 1, startedAt: -1 });
behaviorSessionSchema.index({ startedAt: 1 }, { expireAfterSeconds: 31536000 });

behaviorSessionSchema.methods.end = function endSession() {
    const now = new Date();
    this.endedAt = now;
    this.lastSeenAt = now;
    this.isActive = false;
    this.durationSeconds = Math.max(0, Math.round((now - this.startedAt) / 1000));
    return this.save();
};

behaviorSessionSchema.plugin(tenantIsolationPlugin);

const BehaviorSession = mongoose.model('BehaviorSession', behaviorSessionSchema);

export default BehaviorSession;