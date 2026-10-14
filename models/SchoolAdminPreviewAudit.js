import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const schoolAdminPreviewAuditSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    targetUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    targetRole: {
        type: String,
        enum: ['teacher', 'student'],
        required: true
    },
    startedAt: {
        type: Date,
        default: Date.now,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    endedAt: {
        type: Date,
        default: null
    },
    ipAddress: {
        type: String,
        trim: true,
        default: null
    }
}, { timestamps: true });

schoolAdminPreviewAuditSchema.index({ school: 1, startedAt: -1 });
schoolAdminPreviewAuditSchema.index({ admin: 1, startedAt: -1 });
schoolAdminPreviewAuditSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SchoolAdminPreviewAudit', schoolAdminPreviewAuditSchema);
