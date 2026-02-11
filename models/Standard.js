import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const standardSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    code: {
        type: String,
        required: [true, 'Standard code is required'],
        trim: true,
        uppercase: true
    },
    name: {
        type: String,
        required: [true, 'Standard name is required'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Standard description is required'],
        trim: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: [true, 'Subject is required']
    },
    gradeLevel: {
        type: Number,
        required: [true, 'Grade level is required'],
        min: 1,
        max: 12
    },
    category: {
        type: String,
        trim: true
    },
    // Mastery settings
    masteryThreshold: {
        type: Number,
        default: 80,
        min: 1,
        max: 100
    },
    masteryMinQuestions: {
        type: Number,
        default: 5,
        min: 1
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes
standardSchema.index({ school: 1, code: 1 }, { unique: true });
standardSchema.index({ school: 1, subject: 1 });
standardSchema.index({ school: 1, gradeLevel: 1 });
standardSchema.index({ school: 1, category: 1 });

// Apply tenant isolation plugin
standardSchema.plugin(tenantIsolationPlugin);

const Standard = mongoose.model('Standard', standardSchema);
export default Standard;
