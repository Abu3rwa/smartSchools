import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const mapPracticePlanSkillSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticePlan', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    skill: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeSkill', required: true },
    status: { type: String, enum: ['active', 'improving', 'mastered'], default: 'active' },
    targetAccuracy: { type: Number, min: 0, max: 100, default: 80 },
    teacherNote: { type: String, default: '', trim: true, maxlength: 2000 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

mapPracticePlanSkillSchema.index({ school: 1, plan: 1, skill: 1 }, { unique: true });
mapPracticePlanSkillSchema.index({ school: 1, student: 1, skill: 1 });
mapPracticePlanSkillSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPracticePlanSkill', mapPracticePlanSkillSchema);
