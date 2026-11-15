import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const supportSuggestionDismissalSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    signature: { type: String, required: true, trim: true, maxlength: 80 },
    reason: { type: String, trim: true, maxlength: 300, default: '' },
    dismissedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    dismissedAt: { type: Date, default: Date.now },
}, { timestamps: true });

supportSuggestionDismissalSchema.plugin(tenantIsolationPlugin);
supportSuggestionDismissalSchema.index(
    { school: 1, student: 1, signature: 1 },
    { unique: true },
);

export default mongoose.model('SupportSuggestionDismissal', supportSuggestionDismissalSchema);
