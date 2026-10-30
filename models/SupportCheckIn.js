import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const supportCheckInSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportPlan', required: true },
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportCycle', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    goalId: { type: String, required: true, trim: true, maxlength: 24 },
    taskId: { type: String, required: true, trim: true, maxlength: 24 },
    scope: { type: String, enum: ['home', 'class'], required: true },
    status: {
        type: String,
        enum: ['done', 'didnt_fit', 'need_help'],
        required: true,
    },
    note: { type: String, trim: true, maxlength: 600, default: '' },
    actorKind: { type: String, enum: ['teacher', 'parent', 'staff'], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    respondent: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportRespondent', default: null },
}, { timestamps: true });

supportCheckInSchema.plugin(tenantIsolationPlugin);
supportCheckInSchema.index({ school: 1, plan: 1, taskId: 1, scope: 1 }, { unique: true });
supportCheckInSchema.index({ school: 1, student: 1, scope: 1, createdAt: -1 });

export default mongoose.model('SupportCheckIn', supportCheckInSchema);
