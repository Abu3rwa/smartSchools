import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpInteractionSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plpRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpStudentRecord', default: null },
    plpGoal: { type: mongoose.Schema.Types.ObjectId, default: null },
    plpTask: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorRole: { type: String, enum: ['teacher', 'student', 'admin', 'supervisor'], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actionType: {
        type: String,
        enum: ['comment', 'status_change', 'feedback', 'ai_suggestion_applied', 'supervisor_note'],
        required: true
    },
    visibility: { type: String, enum: ['internal', 'student_visible'], default: 'internal' },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

plpInteractionSchema.plugin(tenantIsolationPlugin);
plpInteractionSchema.index({ school: 1, plpRecord: 1, createdAt: -1 });
plpInteractionSchema.index({ school: 1, actorRole: 1, actionType: 1, createdAt: -1 });

export default mongoose.model('PlpInteraction', plpInteractionSchema);
