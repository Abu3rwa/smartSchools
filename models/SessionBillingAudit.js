import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const sessionBillingAuditSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    actorName: {
        type: String,
        trim: true,
        default: ''
    },
    action: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60,
        index: true
    },
    entityType: {
        type: String,
        trim: true,
        maxlength: 40,
        default: ''
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        index: true
    },
    summary: {
        type: String,
        trim: true,
        maxlength: 400,
        default: ''
    },
    meta: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    }
}, { timestamps: true });

sessionBillingAuditSchema.index({ school: 1, createdAt: -1 });
sessionBillingAuditSchema.index({ school: 1, student: 1, createdAt: -1 });

sessionBillingAuditSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SessionBillingAudit', sessionBillingAuditSchema);
