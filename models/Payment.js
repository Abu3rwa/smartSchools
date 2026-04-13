import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const paymentSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    invoice: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
        required: [true, 'Invoice is required'],
        index: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: [true, 'Student is required'],
        index: true
    },
    amount: {
        type: Number,
        required: [true, 'Payment amount is required'],
        min: [0.01, 'Payment must be greater than zero']
    },
    method: {
        type: String,
        enum: ['cash', 'bank-transfer', 'cheque', 'online', 'other'],
        required: [true, 'Payment method is required']
    },
    reference: {
        type: String,
        trim: true,
        maxlength: 200
    },
    receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receivedAt: {
        type: Date,
        required: true,
        default: Date.now
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 500
    },
    receiptNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    voided: {
        type: Boolean,
        default: false
    },
    voidedAt: {
        type: Date
    },
    voidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    voidReason: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

paymentSchema.index({ school: 1, student: 1, receivedAt: -1 });
paymentSchema.index({ school: 1, method: 1, receivedAt: -1 });
paymentSchema.index({ school: 1, receiptNumber: 1 }, { unique: true });

paymentSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('Payment', paymentSchema);
