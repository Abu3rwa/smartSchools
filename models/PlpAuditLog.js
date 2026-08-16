import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpAuditLogSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    targetType: { type: String },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

plpAuditLogSchema.plugin(tenantIsolationPlugin);
plpAuditLogSchema.index({ school: 1, createdAt: -1 });

export default mongoose.model('PlpAuditLog', plpAuditLogSchema);
