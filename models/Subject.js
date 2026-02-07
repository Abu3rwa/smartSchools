import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const subjectSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: [true, 'Subject name is required'],
        trim: true
    },
    code: {
        type: String,
        required: [true, 'Subject code is required'],
        uppercase: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    // Default marks settings
    passingMarks: {
        type: Number,
        default: 40
    },
    maxMarks: {
        type: Number,
        default: 100
    },
    // For daily classwork
    dailyMaxMarks: {
        type: Number,
        default: 10
    },
    // Credit hours
    creditHours: {
        type: Number,
        default: 1
    },
    // Subject type
    type: {
        type: String,
        enum: ['core', 'elective', 'extra'],
        default: 'core'
    },
    // Applicable grade levels
    applicableGrades: [{
        type: Number,
        min: 1,
        max: 12
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes
subjectSchema.index({ school: 1, code: 1 }, { unique: true });
subjectSchema.index({ name: 1 });

// Apply tenant isolation plugin
subjectSchema.plugin(tenantIsolationPlugin);

const Subject = mongoose.model('Subject', subjectSchema);
export default Subject;
