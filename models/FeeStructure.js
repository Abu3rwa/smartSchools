import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const feeStructureSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: [true, 'Fee structure name is required'],
        trim: true,
        maxlength: 200
    },
    category: {
        type: String,
        enum: ['tuition', 'transport', 'activity', 'lab', 'registration', 'uniform', 'books', 'other'],
        required: [true, 'Category is required']
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        min: [0, 'Amount cannot be negative']
    },
    frequency: {
        type: String,
        enum: ['one-time', 'monthly', 'quarterly', 'semester', 'annual'],
        required: [true, 'Frequency is required']
    },
    appliesTo: {
        grades: [{ type: Number }],
        classes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
        students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }]
    },
    academicYear: {
        type: String,
        required: [true, 'Academic year is required'],
        trim: true
    },
    optional: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

feeStructureSchema.index({ school: 1, academicYear: 1, category: 1 });
feeStructureSchema.index({ school: 1, isActive: 1 });

feeStructureSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('FeeStructure', feeStructureSchema);
