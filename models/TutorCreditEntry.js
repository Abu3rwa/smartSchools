import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * Append-only history of every credit movement on a student's tutor wallet, so an
 * admin can answer "where did this child's questions go?" without reading chats.
 */
const tutorCreditEntrySchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
        type: { type: String, enum: ['grant', 'adjust', 'spend', 'refund'], required: true },
        credits: { type: Number, required: true },
        balanceAfter: { type: Number, default: 0 },
        note: { type: String, trim: true, default: '', maxlength: 300 },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'TutorConversation', default: null },
        practice: { type: mongoose.Schema.Types.ObjectId, ref: 'TutorPracticeSet', default: null },
        createdAt: { type: Date, default: Date.now }
    },
    { timestamps: false }
);

tutorCreditEntrySchema.index({ school: 1, student: 1, createdAt: -1 });

tutorCreditEntrySchema.plugin(tenantIsolationPlugin);

const TutorCreditEntry = mongoose.model('TutorCreditEntry', tutorCreditEntrySchema);
export default TutorCreditEntry;
