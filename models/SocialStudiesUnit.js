import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const socialStudiesUnitSchema = new mongoose.Schema(
    {
        school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
        title: { type: String, required: true, trim: true, maxlength: 200 },
        description: { type: String, trim: true, default: '' },
        gradeLevel: { type: Number, min: 0, max: 12, default: null },
        academicYear: { type: String, trim: true, default: null },
        semester: { type: Number, enum: [1, 2], default: null },
        order: { type: Number, default: 0 },
        isPublished: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

socialStudiesUnitSchema.index({ school: 1, teacher: 1, academicYear: 1 });
socialStudiesUnitSchema.index({ school: 1, academicYear: 1, semester: 1 });
socialStudiesUnitSchema.index({ school: 1, gradeLevel: 1, isPublished: 1 });

socialStudiesUnitSchema.plugin(tenantIsolationPlugin);

const SocialStudiesUnit = mongoose.model('SocialStudiesUnit', socialStudiesUnitSchema);
export default SocialStudiesUnit;
