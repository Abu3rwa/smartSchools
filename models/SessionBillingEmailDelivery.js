import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const sessionBillingEmailDeliverySchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    recipientEmail: { type: String, required: true, trim: true, lowercase: true },
    recipientType: {
        type: String,
        enum: ['student', 'father', 'mother', 'guardian'],
        required: true
    },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    language: { type: String, enum: ['en', 'ar', 'both'], default: 'en' },
    purpose: {
        type: String,
        enum: ['statement', 'reminder', 'receipt'],
        default: 'statement',
        index: true
    },
    // A statement is sent once per billing period; the key is what stops a
    // second send to the same family unless the sender confirms a resend.
    periodKey: { type: String, required: true, trim: true, maxlength: 80 },
    periodFrom: { type: Date },
    periodTo: { type: Date },
    attempt: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['sending', 'sent', 'failed'], required: true },
    error: { type: String, default: '', maxlength: 500 },
    messageId: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date, default: null }
}, { timestamps: true });

sessionBillingEmailDeliverySchema.plugin(tenantIsolationPlugin);
sessionBillingEmailDeliverySchema.index(
    { school: 1, student: 1, recipientEmail: 1, periodKey: 1, purpose: 1, attempt: 1 },
    { unique: true }
);
sessionBillingEmailDeliverySchema.index({ school: 1, student: 1, periodKey: 1, createdAt: -1 });

export default mongoose.model('SessionBillingEmailDelivery', sessionBillingEmailDeliverySchema);
