import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const selCompetencySchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYear: { type: String, required: true },
    code: { type: String, required: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    color: { type: String, default: '' },
    displayOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

selCompetencySchema.plugin(tenantIsolationPlugin);
selCompetencySchema.index({ school: 1, academicYear: 1, code: 1 }, { unique: true });
selCompetencySchema.index({ school: 1, academicYear: 1, active: 1, displayOrder: 1 });

export default mongoose.model('SelCompetency', selCompetencySchema);
