import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import {
    BEHAVIOR_NOTIFICATION_CHANNELS,
    BEHAVIOR_NOTIFICATION_STATUSES
} from '../constants/behavior.js';

/**
 * One row per (incident, step, channel, language). An email row is the rendered
 * message plus its resolved recipients, and the unique idempotency key means a
 * retried release updates that row instead of queueing a second send. Delivery
 * bookkeeping lives here too, so a failed send is visible rather than dropped.
 */
const behaviorNotificationSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'BehaviorIncident', required: true },
    stepOrder: { type: Number, default: null },
    channel: { type: String, enum: BEHAVIOR_NOTIFICATION_CHANNELS, required: true },
    status: { type: String, enum: BEHAVIOR_NOTIFICATION_STATUSES, default: 'draft' },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    subject: { type: String, default: '' },
    body: { type: String, default: '' },
    // The prose belongs to the school's template; these are the facts it was written
    // from, rendered in the row's own language so the email can carry a summary panel.
    facts: {
        student: { type: String, default: '' },
        school: { type: String, default: '' },
        date: { type: String, default: '' },
        behavior: { type: String, default: '' },
        nextStep: { type: String, default: '' },
        dueBy: { type: String, default: '' }
    },
    recipients: [{ name: String, email: String, relation: String, hasEmail: Boolean }],
    cc: [{ role: String, name: String, email: String }],
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 300 },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
    // Why release is blocked, e.g. AWAITING_APPROVAL or DELIVERY_DISABLED.
    blockedReason: { type: String, default: null },
    readyAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    messageId: { type: String, default: null },
    transport: { type: String, default: null },
    createdAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

behaviorNotificationSchema.plugin(tenantIsolationPlugin);
behaviorNotificationSchema.set('collection', 'behavior_notifications');

behaviorNotificationSchema.index({ idempotencyKey: 1 }, { unique: true, background: true });
behaviorNotificationSchema.index({ school: 1, incident: 1, channel: 1 }, { background: true });
behaviorNotificationSchema.index({ school: 1, status: 1, createdAt: -1 }, { background: true });
behaviorNotificationSchema.index({ channel: 1, status: 1, nextAttemptAt: 1 }, { background: true });

export default mongoose.model('BehaviorNotification', behaviorNotificationSchema);
