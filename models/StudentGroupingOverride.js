import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const LEVELS = ['advanced', 'proficient', 'approaching', 'below'];

const studentGroupingOverrideSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    standard: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Standard',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    overrideLevel: {
        type: String,
        enum: LEVELS,
        required: true
    },
    reason: {
        type: String,
        maxlength: 500,
        default: ''
    },
    academicYear: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

studentGroupingOverrideSchema.index(
    { school: 1, class: 1, standard: 1, student: 1, academicYear: 1 },
    { unique: true }
);
studentGroupingOverrideSchema.index({ school: 1, class: 1, standard: 1, academicYear: 1 });

studentGroupingOverrideSchema.plugin(tenantIsolationPlugin);

const StudentGroupingOverride = mongoose.model('StudentGroupingOverride', studentGroupingOverrideSchema);
export default StudentGroupingOverride;
