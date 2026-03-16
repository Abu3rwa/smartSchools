import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const upgradeRequestSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    currentPlan: {
        type: String,
        lowercase: true,
        trim: true,
        default: 'starter'
    },
    requestedPlan: {
        type: String,
        lowercase: true,
        trim: true,
        default: ''
    },
    requestedFeatures: [{
        type: String,
        trim: true
    }],
    message: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'in_review', 'approved', 'rejected'],
        default: 'pending'
    },
    review: {
        handledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        handledAt: {
            type: Date
        },
        note: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: ''
        }
    }
}, {
    timestamps: true
});

upgradeRequestSchema.index({ school: 1, status: 1, createdAt: -1 });
upgradeRequestSchema.index({ status: 1, createdAt: -1 });

upgradeRequestSchema.plugin(tenantIsolationPlugin);

const UpgradeRequest = mongoose.model('UpgradeRequest', upgradeRequestSchema);

export default UpgradeRequest;
