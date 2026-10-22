import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { BEHAVIOR_SEVERITY_LEVELS } from '../constants/behavior.js';

const behaviorTypeSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: [true, 'Behavior name is required'], trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    // Display/reporting level from the school consequence chart (1 = Oops .. 4 = Serious).
    level: {
        type: Number,
        required: true,
        min: Math.min(...BEHAVIOR_SEVERITY_LEVELS),
        max: Math.max(...BEHAVIOR_SEVERITY_LEVELS)
    },
    active: { type: Boolean, default: true },
    ladder: { type: mongoose.Schema.Types.ObjectId, ref: 'BehaviorLadder', default: null },
    // Stable key so the seed can recognise its own rows without overwriting edits.
    seedKey: { type: String, trim: true, default: null }
}, { timestamps: true });

behaviorTypeSchema.plugin(tenantIsolationPlugin);
behaviorTypeSchema.set('collection', 'behavior_types');

behaviorTypeSchema.index({ school: 1, name: 1 }, { unique: true, background: true });
behaviorTypeSchema.index({ school: 1, active: 1, level: 1 }, { background: true });
behaviorTypeSchema.index({ school: 1, seedKey: 1 }, { background: true });

export default mongoose.model('BehaviorType', behaviorTypeSchema);
