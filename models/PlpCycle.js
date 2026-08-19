import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const plpCycleSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    academicYear: { type: String, required: true, trim: true },
    cycleCode: { type: String, required: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: ['draft', 'published', 'closed'], default: 'draft' },
    requiredSections: {
        character: { type: Boolean, default: true },
        academics: { type: Boolean, default: true },
        studentReflection: { type: Boolean, default: true },
        teacherFeedback: { type: Boolean, default: true },
    },
    printOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

plpCycleSchema.plugin(tenantIsolationPlugin);
plpCycleSchema.index({ school: 1, academicYear: 1, cycleCode: 1 }, { unique: true });
plpCycleSchema.index({ school: 1, academicYear: 1, status: 1, printOrder: 1 });

export default mongoose.model('PlpCycle', plpCycleSchema);
