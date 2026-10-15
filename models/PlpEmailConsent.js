import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpEmailConsentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    recipientEmail: { type: String, required: true, trim: true, lowercase: true },
    recipientType: { type: String, enum: ['student', 'father', 'mother', 'guardian'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    optedIn: { type: Boolean, default: false },
    optedInAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
}, { timestamps: true });

plpEmailConsentSchema.plugin(tenantIsolationPlugin);
plpEmailConsentSchema.index({ school: 1, student: 1, recipientEmail: 1 }, { unique: true });

export default mongoose.model('PlpEmailConsent', plpEmailConsentSchema);
