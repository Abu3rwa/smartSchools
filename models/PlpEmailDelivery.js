import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpEmailDeliverySchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plpRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpStudentRecord', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    recipientEmail: { type: String, required: true, trim: true, lowercase: true },
    recipientType: { type: String, enum: ['student', 'father', 'mother', 'guardian'], required: true },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attempt: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['sending', 'sent', 'failed'], required: true },
    error: { type: String, default: '' },
    messageId: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date, default: null },
}, { timestamps: true });

plpEmailDeliverySchema.plugin(tenantIsolationPlugin);
plpEmailDeliverySchema.index(
    { school: 1, plpRecord: 1, recipientEmail: 1, attempt: 1 },
    { unique: true }
);
plpEmailDeliverySchema.index({ school: 1, plpRecord: 1, createdAt: -1 });

export default mongoose.model('PlpEmailDelivery', plpEmailDeliverySchema);
