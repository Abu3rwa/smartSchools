import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const mapPrepTopicSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    domain: { type: String, default: '' },
    skillCodes: [{ type: String }],
    evidenceSummary: { type: String, default: '' },
    status: { type: String, enum: ['available', 'questions_generated'], default: 'available' },
    lastQuestionSet: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPrepQuestionSet', default: null }
}, { timestamps: true });

const mapPrepPlanSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    ownerTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    academicYear: { type: String, required: true },
    mapTestRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'MapTestRecord', required: true, unique: true },
    title: { type: String, required: true, trim: true },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    currentRoundNumber: { type: Number, default: 0, min: 0 },
    analysisStatus: { type: String, enum: ['not_started', 'draft', 'teacher_review', 'approved'], default: 'not_started' },
    topics: [mapPrepTopicSchema],
    topicsStatus: { type: String, enum: ['not_started', 'generating', 'ready', 'failed'], default: 'not_started' },
    topicsError: { type: String, default: '' }
}, { timestamps: true });

mapPrepPlanSchema.index({ school: 1, student: 1, academicYear: 1 });
mapPrepPlanSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPrepPlan', mapPrepPlanSchema);
