import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const spellingIntegrityEventSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', required: true },
    eventId: { type: String, required: true, trim: true, maxlength: 64 },
    eventType: { type: String, enum: ['page_hidden'], required: true },
    sequence: { type: Number, default: null, min: 1 },
    occurredAt: { type: Date, default: null },
    receivedAt: { type: Date, default: Date.now, required: true }
}, { timestamps: true });

spellingIntegrityEventSchema.index({ school: 1, session: 1, eventId: 1 }, { unique: true });
spellingIntegrityEventSchema.index({ school: 1, session: 1, receivedAt: -1 });
spellingIntegrityEventSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SpellingIntegrityEvent', spellingIntegrityEventSchema);