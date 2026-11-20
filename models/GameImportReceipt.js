import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// Written in the same transaction as the imported packs, so a retried commit
// returns the stored result instead of importing twice.
const gameImportReceiptSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    actor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    submissionId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    fingerprint: {
        type: String,
        required: true
    },
    result: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    }
}, { timestamps: true });

gameImportReceiptSchema.plugin(tenantIsolationPlugin);
gameImportReceiptSchema.index({ school: 1, actor: 1, submissionId: 1 }, { unique: true });
gameImportReceiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

export default mongoose.model('GameImportReceipt', gameImportReceiptSchema);
