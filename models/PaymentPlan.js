import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const installmentSchema = new mongoose.Schema({
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: {
        type: String,
        enum: ['pending', 'paid', 'overdue'],
        default: 'pending'
    },
    payment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
    }
}, { _id: true });

const paymentPlanSchema = new mongoose.Schema({
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
    invoice: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
        required: true
    },
    installments: {
        type: [installmentSchema],
        validate: {
            validator: (v) => Array.isArray(v) && v.length >= 2,
            message: 'Payment plan must have at least 2 installments'
        }
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'defaulted'],
        default: 'active'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

paymentPlanSchema.index({ school: 1, student: 1, status: 1 });

paymentPlanSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('PaymentPlan', paymentPlanSchema);
