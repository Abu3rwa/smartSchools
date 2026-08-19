import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpTaskSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plpGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpGoal', required: true },
    plpRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpStudentRecord', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    assignedByTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    instructions: { type: String, default: '', trim: true, maxlength: 4000 },
    dueDate: { type: Date, default: null },
    status: {
        type: String,
        enum: ['assigned', 'in_progress', 'submitted_by_student', 'reviewed', 'completed', 'needs_revision'],
        default: 'assigned'
    },
    studentCompletionNote: { type: String, default: '', trim: true, maxlength: 1000 },
    studentComment: { type: String, default: '', trim: true, maxlength: 1000 },
    teacherFeedback: { type: String, default: '', trim: true, maxlength: 2000 },
    teacherFollowUpAction: { type: String, default: '', trim: true, maxlength: 2000 },
    completionEvidenceLinks: [{ type: String, trim: true }],
    notifiedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

plpTaskSchema.plugin(tenantIsolationPlugin);
plpTaskSchema.index({ school: 1, student: 1, status: 1, dueDate: 1 });
plpTaskSchema.index({ school: 1, plpGoal: 1, createdAt: -1 });

export default mongoose.model('PlpTask', plpTaskSchema);
