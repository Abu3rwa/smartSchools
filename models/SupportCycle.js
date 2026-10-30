import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const supportCycleSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYear: { type: String, required: true, trim: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    homeroomTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    round: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: ['draft', 'active', 'closed'], default: 'draft' },
    surveyDueDate: { type: Date, default: null },
    previousCycle: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportCycle', default: null },
    closedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

supportCycleSchema.plugin(tenantIsolationPlugin);
supportCycleSchema.index({ school: 1, student: 1, academicYear: 1, month: 1 }, { unique: true });
supportCycleSchema.index({ school: 1, homeroomTeacher: 1, status: 1, month: 1 });
supportCycleSchema.index({ school: 1, class: 1, academicYear: 1, month: 1 });

export default mongoose.model('SupportCycle', supportCycleSchema);
