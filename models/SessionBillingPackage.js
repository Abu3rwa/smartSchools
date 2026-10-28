import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const sessionBillingPackageSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    minutes: {
        type: Number,
        required: true,
        min: 1,
        max: 100000
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
        default: 'USD'
    },
    // Days from purchase until unused minutes expire. 0 means never.
    expiryDays: {
        type: Number,
        min: 0,
        max: 3650,
        default: 0
    },
    eligibleClasses: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Class',
        default: []
    },
    carryOver: {
        type: Boolean,
        default: false
    },
    refundable: {
        type: Boolean,
        default: false
    },
    active: {
        type: Boolean,
        default: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

sessionBillingPackageSchema.index({ school: 1, active: 1, name: 1 });

sessionBillingPackageSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SessionBillingPackage', sessionBillingPackageSchema);
