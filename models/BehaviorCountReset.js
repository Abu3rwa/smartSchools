import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * A reset is a marker, never a delete. The newest marker for a student (+
 * behavior) starts a new counting window.
 */
const behaviorCountResetSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    behaviorType: { type: mongoose.Schema.Types.ObjectId, ref: 'BehaviorType', default: null },
    resetBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    resetAt: { type: Date, default: () => new Date() },
    reason: { type: String, required: true, trim: true, maxlength: 1000 }
}, { timestamps: true });

behaviorCountResetSchema.plugin(tenantIsolationPlugin);
behaviorCountResetSchema.set('collection', 'behavior_count_resets');

behaviorCountResetSchema.index({ school: 1, student: 1, behaviorType: 1, resetAt: -1 }, { background: true });

export default mongoose.model('BehaviorCountReset', behaviorCountResetSchema);
