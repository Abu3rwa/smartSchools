import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpGoalSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plpRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpStudentRecord', required: true },
    goalType: { type: String, enum: ['character', 'academic'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    linkedTraitCodes: [{ type: String, trim: true }],
    linkedSubjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    linkedStandardIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Standard' }],
    baselineNote: { type: String, default: '', trim: true, maxlength: 2000 },
    successCriteria: { type: String, default: '', trim: true, maxlength: 2000 },
    teacherProgressNote: { type: String, default: '', trim: true, maxlength: 2000 },
    targetDate: { type: Date, default: null },
    status: { type: String, enum: ['active', 'completed', 'carried_forward', 'archived'], default: 'active' },
    aiSuggested: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

plpGoalSchema.plugin(tenantIsolationPlugin);
plpGoalSchema.index({ school: 1, plpRecord: 1, status: 1, createdAt: -1 });

export default mongoose.model('PlpGoal', plpGoalSchema);
