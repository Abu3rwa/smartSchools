import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpActivitySchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plpRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpStudentRecord', required: true },
    source: { type: String, enum: ['suggested_from_observations', 'added_by_teacher'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, default: '', trim: true, maxlength: 4000 },
    traitId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpTraitConfig', default: null },
    rationale: { type: String, default: '', trim: true, maxlength: 1000 },
    goal: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpGoal', default: null },
    dueDate: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpTask', default: null },
    taskStatus: { type: String, enum: ['not_assigned', 'assigned', 'in_progress', 'submitted', 'completed', 'needs_revision'], default: 'not_assigned' },
}, { timestamps: true });

plpActivitySchema.plugin(tenantIsolationPlugin);
plpActivitySchema.index({ school: 1, plpRecord: 1, source: 1, createdAt: -1 });

export default mongoose.model('PlpActivity', plpActivitySchema);
