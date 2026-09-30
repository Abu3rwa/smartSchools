import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const mapPracticePlanSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', default: null },
    academicYear: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    normalizedTitle: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
    sourceStudentId: { type: String, default: '', trim: true, maxlength: 80 },
    season: { type: String, default: '', trim: true, maxlength: 80 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    skills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeSkill' }],
    createdFromBatch: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticeImportBatch', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

mapPracticePlanSchema.index({ school: 1, student: 1, normalizedTitle: 1 }, { unique: true });
mapPracticePlanSchema.index({ school: 1, student: 1, status: 1, updatedAt: -1 });
mapPracticePlanSchema.index({ school: 1, class: 1, academicYear: 1, status: 1 });
mapPracticePlanSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPracticePlan', mapPracticePlanSchema);
