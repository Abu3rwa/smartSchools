import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const deviceTokenSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    token: {
        type: String,
        required: true,
        trim: true
    },
    platform: {
        type: String,
        enum: ['android', 'ios', 'web'],
        default: 'android'
    },
    active: {
        type: Boolean,
        default: true
    },
    lastSeen: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

deviceTokenSchema.index({ user: 1, token: 1 }, { unique: true });
deviceTokenSchema.index({ token: 1 }); // plain index for lookup; not globally unique (tokens can be recycled across users)
deviceTokenSchema.plugin(tenantIsolationPlugin);

const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);
export default DeviceToken;

