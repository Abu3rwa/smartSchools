import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

export const TUTOR_CLASS_STATES = ['on', 'paused', 'locked'];

/**
 * Per-class switch. A class with no row follows the school setting. `paused` is a
 * temporary stop the admin can lift; `locked` means the tutor stays away from that
 * class until the admin deliberately turns it back to `on`.
 */
const tutorClassAccessSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
        class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
        status: { type: String, enum: TUTOR_CLASS_STATES, default: 'on' },
        note: { type: String, trim: true, default: '', maxlength: 300 },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    { timestamps: true }
);

tutorClassAccessSchema.index({ school: 1, class: 1 }, { unique: true });

tutorClassAccessSchema.plugin(tenantIsolationPlugin);

const TutorClassAccess = mongoose.model('TutorClassAccess', tutorClassAccessSchema);
export default TutorClassAccess;
