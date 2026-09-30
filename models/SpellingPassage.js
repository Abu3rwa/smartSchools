import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const spellingPassageSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingSession', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    supersedes: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingPassage', default: null },
    style: { type: String, enum: ['passage', 'sentence-list'], default: 'sentence-list' },
    missedWords: { type: [String], default: [] },
    highlightedWords: { type: [String], default: [] },
    content: { type: String, default: '', maxlength: 4000 },
    status: { type: String, enum: ['draft', 'approved', 'queued', 'sent', 'failed', 'discarded'], default: 'draft' },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editedAt: { type: Date, default: null },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editedByTeacher: { type: Boolean, default: false },
    regenerationCount: { type: Number, default: 0, min: 0, max: 3 },
    emailDeliveryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingEmailDelivery', default: null },
    lastError: { type: String, default: '' },
    sentAt: { type: Date, default: null }
}, { timestamps: true, suppressReservedKeysWarning: true });

spellingPassageSchema.index({ school: 1, student: 1, createdAt: -1 });
spellingPassageSchema.index({ school: 1, status: 1, createdAt: -1 });
spellingPassageSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SpellingPassage', spellingPassageSchema);
