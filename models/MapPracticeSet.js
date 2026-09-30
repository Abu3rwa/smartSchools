import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const mapPracticeSetSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MapPracticePlan', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    setId: { type: String, required: true, trim: true, maxlength: 120 },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    order: { type: Number, default: 0, min: 0 },
    questionCount: { type: Number, default: 0, min: 0 },
    estimatedMinutes: { type: Number, default: 10, min: 1 },
    status: { type: String, enum: ['available', 'assigned', 'archived'], default: 'available' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

mapPracticeSetSchema.index({ school: 1, plan: 1, setId: 1 }, { unique: true });
mapPracticeSetSchema.index({ school: 1, student: 1, order: 1 });
mapPracticeSetSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('MapPracticeSet', mapPracticeSetSchema);
