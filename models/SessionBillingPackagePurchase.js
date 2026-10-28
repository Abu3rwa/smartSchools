import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const sessionBillingPackagePurchaseSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
        index: true
    },
    package: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SessionBillingPackage'
    },
    // Snapshot so later package edits never rewrite a family's purchase.
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    minutesIncluded: {
        type: Number,
        required: true,
        min: 1
    },
    minutesRemaining: {
        type: Number,
        required: true,
        min: 0
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
    purchasedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    expiresAt: {
        type: Date,
        default: null
    },
    eligibleClasses: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Class',
        default: []
    },
    paymentEntry: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SessionBillingEntry'
    },
    status: {
        type: String,
        enum: ['active', 'exhausted', 'expired', 'cancelled'],
        default: 'active',
        index: true
    },
    note: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

sessionBillingPackagePurchaseSchema.index({ school: 1, student: 1, status: 1, expiresAt: 1 });

sessionBillingPackagePurchaseSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SessionBillingPackagePurchase', sessionBillingPackagePurchaseSchema);
