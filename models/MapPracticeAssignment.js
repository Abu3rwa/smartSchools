import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const mapPracticeAssignmentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticePlan', required: true },
    set: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeSet', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: ['draft', 'assigned', 'active', 'closed'], default: 'draft' },
    feedbackMode: { type: String, enum: ['instant', 'after_submit', 'after_review'], default: 'instant' },
    selfPractice: { type: Boolean, default: true },
    showTimer: { type: Boolean, default: false },
    timeLimitSeconds: { type: Number, default: null },
    hidden: { type: Boolean, default: false }
}, { timestamps: true });

mapPracticeAssignmentSchema.index({ school: 1, student: 1, set: 1 }, { unique: true });
mapPracticeAssignmentSchema.index({ school: 1, student: 1, status: 1, dueDate: 1 });
mapPracticeAssignmentSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPracticeAssignment', mapPracticeAssignmentSchema);
