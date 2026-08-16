import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpSupervisorAssignmentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    active: { type: Boolean, default: true },
}, { timestamps: true });

plpSupervisorAssignmentSchema.plugin(tenantIsolationPlugin);
plpSupervisorAssignmentSchema.index({ school: 1, supervisor: 1, teacher: 1 }, { unique: true });

export default mongoose.model('PlpSupervisorAssignment', plpSupervisorAssignmentSchema);
