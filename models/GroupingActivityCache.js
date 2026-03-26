import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const LEVELS = ['advanced', 'proficient', 'approaching', 'below'];

const activitySchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, default: 'activity' },
    materials: { type: String, default: '' }
}, { _id: false });

const groupingActivityCacheSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    standard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: true
    },
    level: {
        type: String,
        enum: LEVELS,
        required: true
    },
    activities: [activitySchema],
    generatedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

groupingActivityCacheSchema.index(
    { school: 1, standard: 1, level: 1 },
    { unique: true }
);
groupingActivityCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

groupingActivityCacheSchema.plugin(tenantIsolationPlugin);

const GroupingActivityCache = mongoose.model('GroupingActivityCache', groupingActivityCacheSchema);
export default GroupingActivityCache;
