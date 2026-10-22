import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * One row per student + behavior + counting window. The window key changes when
 * a window rolls over or an admin resets counts, so escalation restarts without
 * deleting a single incident. Reserved with an atomic $inc so two staff members
 * logging the same student at the same moment cannot get the same step.
 */
const behaviorCounterSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    behaviorType: { type: mongoose.Schema.Types.ObjectId, ref: 'BehaviorType', required: true },
    windowKey: { type: String, required: true, trim: true, maxlength: 200 },
    count: { type: Number, default: 0 },
    windowStart: { type: Date, default: null },
    windowEnd: { type: Date, default: null },
    mode: { type: String, default: null }
}, { timestamps: true });

behaviorCounterSchema.plugin(tenantIsolationPlugin);
behaviorCounterSchema.set('collection', 'behavior_counters');

behaviorCounterSchema.index(
    { school: 1, student: 1, behaviorType: 1, windowKey: 1 },
    { unique: true, background: true }
);

export default mongoose.model('BehaviorCounter', behaviorCounterSchema);
