import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpEvidenceSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    plpRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpStudentRecord', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['observation', 'incident', 'positive_example', 'reflection'], required: true },
    note: { type: String, required: true, maxlength: 1000 },
    taggedTraits: [{ type: String }],
}, { timestamps: true });

plpEvidenceSchema.plugin(tenantIsolationPlugin);
plpEvidenceSchema.index({ school: 1, plpRecord: 1 });

export default mongoose.model('PlpEvidence', plpEvidenceSchema);
