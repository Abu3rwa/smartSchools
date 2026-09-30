import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const spellingEmailDeliverySchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', required: true },
    passage: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingPassage', default: null },
    kind: { type: String, enum: ['results', 'passage'], default: 'results' },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    recipients: { type: [String], default: [] },
    subject: { type: String, required: true, maxlength: 220 },
    html: { type: String, required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ['staging', 'pending', 'processing', 'sent', 'failed', 'cancelled'], default: 'pending' },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    sentAt: { type: Date, default: null },
    lastError: { type: String, default: '' }
}, { timestamps: true, suppressReservedKeysWarning: true });

spellingEmailDeliverySchema.index({ school: 1, status: 1, nextAttemptAt: 1 });
spellingEmailDeliverySchema.index(
    { passage: 1, kind: 1 },
    { unique: true, partialFilterExpression: { passage: { $type: 'objectId' } } }
);
spellingEmailDeliverySchema.plugin(tenantIsolationPlugin);

const SpellingEmailDelivery = mongoose.model('SpellingEmailDelivery', spellingEmailDeliverySchema);
export default SpellingEmailDelivery;
