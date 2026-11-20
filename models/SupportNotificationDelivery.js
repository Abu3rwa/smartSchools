import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const supportNotificationDeliverySchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    kind: { type: String, enum: ['invitation', 'reminder', 'escalation'], required: true, index: true },
    survey: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportSurvey', default: null },
    respondent: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportRespondent', default: null },
    recipientEmail: { type: String, required: true, trim: true, lowercase: true },
    // One send per logical event: `invite:review:<id>:<respondent>`,
    // `reminder:<surveyId>:<reminderNumber>`. Retries reuse the key, so a
    // provider timeout after delivery can never produce a duplicate email.
    dedupeKey: { type: String, required: true, trim: true, maxlength: 160 },
    attempt: { type: Number, required: true, min: 1, default: 1 },
    status: { type: String, enum: ['sending', 'sent', 'failed'], required: true },
    error: { type: String, default: '', maxlength: 500 },
    messageId: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date, default: null },
}, { timestamps: true });

supportNotificationDeliverySchema.plugin(tenantIsolationPlugin);
supportNotificationDeliverySchema.index({ school: 1, dedupeKey: 1, attempt: 1 }, { unique: true });
supportNotificationDeliverySchema.index({ school: 1, kind: 1, createdAt: -1 });

export default mongoose.model('SupportNotificationDelivery', supportNotificationDeliverySchema);
