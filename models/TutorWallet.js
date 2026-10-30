import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * A student's own tutor credit, separate from the teacher AI credit ledger.
 * One credit buys one question to the tutor. Nothing ever zeroes this wallet at
 * the end of a term: unused credits carry into the next term until the admin
 * changes them.
 */
const tutorWalletSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        credits: { type: Number, default: 0, min: 0 },
        granted: { type: Number, default: 0 },
        spent: { type: Number, default: 0 },
        paused: { type: Boolean, default: false },
        lastGrantAt: { type: Date, default: null },
        lowNotifiedAt: { type: Date, default: null },
        emptyNotifiedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

tutorWalletSchema.index({ school: 1, student: 1 }, { unique: true });

tutorWalletSchema.plugin(tenantIsolationPlugin);

const TutorWallet = mongoose.model('TutorWallet', tutorWalletSchema);
export default TutorWallet;
