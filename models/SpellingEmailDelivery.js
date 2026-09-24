import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const spellingEmailDeliverySchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', required: true, unique: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    recipients: { type: [String], default: [] },
    subject: { type: String, required: true, maxlength: 220 },
    html: { type: String, required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processing', 'sent', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    sentAt: { type: Date, default: null },
    lastError: { type: String, default: '' }
}, { timestamps: true, suppressReservedKeysWarning: true });

spellingEmailDeliverySchema.index({ school: 1, status: 1, nextAttemptAt: 1 });
spellingEmailDeliverySchema.plugin(tenantIsolationPlugin);

const SpellingEmailDelivery = mongoose.model('SpellingEmailDelivery', spellingEmailDeliverySchema);
export default SpellingEmailDelivery;
