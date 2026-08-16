import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpTraitConfigSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, default: '' },
    selSkills: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    themeCode: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

plpTraitConfigSchema.plugin(tenantIsolationPlugin);
plpTraitConfigSchema.index({ school: 1, code: 1 }, { unique: true });
plpTraitConfigSchema.index({ school: 1, displayOrder: 1 });
plpTraitConfigSchema.index({ school: 1, isActive: 1 });

export default mongoose.model('PlpTraitConfig', plpTraitConfigSchema);
