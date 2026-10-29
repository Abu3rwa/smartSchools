import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * A parent-support email written from a saved spelling analysis. It only ever
 * leaves the building when an admin or the student's teacher presses send.
 */
const spellingParentDraftSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, trim: true, maxlength: 160, default: '' },
    analysis: { type: mongoose.Schema.Types.ObjectId, ref: 'SpellingAnalysis', default: null },
    grade: { type: String, default: null },
    period: {
        kind: { type: String, enum: ['month', 'all'], default: 'month', required: true },
        key: { type: String, trim: true, maxlength: 20, required: true }
    },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    subject: { type: String, trim: true, maxlength: 200, default: '' },
    body: { type: String, default: '', maxlength: 6000 },
    status: { type: String, enum: ['draft', 'sent', 'discarded'], default: 'draft' },
    recipients: { type: [String], default: [] },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    ai: {
        modelName: { type: String, default: '' },
        entryId: { type: String, default: '' },
        chargedCents: { type: Number, default: 0, min: 0 }
    },
    sentAt: { type: Date, default: null },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, suppressReservedKeysWarning: true });

spellingParentDraftSchema.index(
    { school: 1, student: 1, 'period.kind': 1, 'period.key': 1 },
    { unique: true, name: 'school_student_parent_draft_unique' }
);
spellingParentDraftSchema.plugin(tenantIsolationPlugin);

const SpellingParentDraft = mongoose.model('SpellingParentDraft', spellingParentDraftSchema);
export default SpellingParentDraft;
