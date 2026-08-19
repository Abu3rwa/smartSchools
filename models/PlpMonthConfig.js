import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpMonthConfigSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYear: { type: String, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    theme: { type: String, enum: ['confidence', 'hope', 'wisdom'], required: true },
    secondaryTrait: { type: mongoose.Schema.Types.ObjectId, ref: 'PlpTraitConfig', default: null },
    status: { type: String, enum: ['draft', 'published', 'closed'], default: 'draft' },
    weights: {
        coreTrait: { type: Number, default: 60 },
        secondaryTrait1: { type: Number, default: 15 },
        secondaryTrait2: { type: Number, default: 15 },
        secondaryTrait3: { type: Number, default: 10 },
    },
    minEvidenceCount: { type: Number, default: 2 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

plpMonthConfigSchema.plugin(tenantIsolationPlugin);
plpMonthConfigSchema.index({ school: 1, academicYear: 1, month: 1 }, { unique: true });

export default mongoose.model('PlpMonthConfig', plpMonthConfigSchema);
