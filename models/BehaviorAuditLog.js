import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const IMMUTABLE_MESSAGE = 'Behavior audit entries are immutable';

const behaviorAuditLogSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'BehaviorIncident', default: null },
    targetType: { type: String, default: null },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    action: { type: String, required: true, trim: true, maxlength: 80 },
    actor: {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        role: { type: String, default: null },
        name: { type: String, default: null }
    },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: () => new Date(), index: true }
}, { timestamps: false });

behaviorAuditLogSchema.plugin(tenantIsolationPlugin);
behaviorAuditLogSchema.set('collection', 'behavior_audit_log');

behaviorAuditLogSchema.index({ school: 1, createdAt: -1 }, { background: true });
behaviorAuditLogSchema.index({ school: 1, incident: 1, createdAt: 1 }, { background: true });

// Writes are insert-only; edits and deletes are refused at the model level.
const blockMutation = function blockMutation(next) {
    next(new Error(IMMUTABLE_MESSAGE));
};
behaviorAuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], blockMutation);
behaviorAuditLogSchema.pre('save', function preventResave(next) {
    if (this.isNew) return next();
    next(new Error(IMMUTABLE_MESSAGE));
});

export default mongoose.model('BehaviorAuditLog', behaviorAuditLogSchema);
