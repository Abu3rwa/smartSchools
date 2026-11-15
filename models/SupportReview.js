import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

export const SUPPORT_REVIEW_STATUSES = ['preparing', 'issued', 'completed', 'cancelled'];

const supportReviewSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    case: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportCase', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    academicYear: { type: String, required: true, trim: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    sequence: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: SUPPORT_REVIEW_STATUSES, default: 'preparing' },
    dueDate: { type: Date, default: null },
    evidenceCutoff: { type: Date, default: null },
    studentVoice: { type: Boolean, default: false },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    issuedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

supportReviewSchema.plugin(tenantIsolationPlugin);
supportReviewSchema.index({ school: 1, case: 1, academicYear: 1, month: 1 }, { unique: true });
supportReviewSchema.index({ school: 1, status: 1, dueDate: 1 });
supportReviewSchema.index({ school: 1, student: 1, createdAt: -1 });

export default mongoose.model('SupportReview', supportReviewSchema);
