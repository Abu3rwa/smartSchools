import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const discountSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: [true, 'Discount name is required'],
        trim: true,
        maxlength: 200
    },
    type: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: [true, 'Discount type is required']
    },
    value: {
        type: Number,
        required: [true, 'Discount value is required'],
        min: [0, 'Value cannot be negative']
    },
    criteria: {
        siblingCount: { type: Number, min: 2 },
        staffChild: { type: Boolean },
        merit: { type: Boolean },
        custom: { type: String, trim: true }
    },
    maxAmount: {
        type: Number,
        min: 0,
        default: null
    },
    applicableFeeCategories: [{
        type: String,
        enum: ['tuition', 'transport', 'activity', 'lab', 'registration', 'uniform', 'books', 'other']
    }],
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

discountSchema.index({ school: 1, isActive: 1 });

discountSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('Discount', discountSchema);
