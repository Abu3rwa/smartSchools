import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const vocabListSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    // Stable identifier such as S1-L1; titles are display-only and may change.
    listId: { type: String, required: true, trim: true, uppercase: true, match: /^S[12]-L\d{1,2}$/ },
    semester: { type: Number, enum: [1, 2], required: true },
    listNumber: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    lessonTitle: { type: String, default: '', trim: true, maxlength: 200 },
    order: { type: Number, default: 0 },
    visible: { type: Boolean, default: true },
    acceptBaseForm: { type: Boolean, default: false }
}, { timestamps: true });

vocabListSchema.index({ school: 1, listId: 1 }, { unique: true });
vocabListSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('VocabList', vocabListSchema);
