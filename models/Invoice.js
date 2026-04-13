import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const invoiceItemSchema = new mongoose.Schema({
    feeStructure: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FeeStructure'
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0
    },
    discountRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Discount'
    },
    net: {
        type: Number,
        required: true,
        min: 0
    }
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: [true, 'Student is required'],
        index: true
    },
    invoiceNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    items: {
        type: [invoiceItemSchema],
        validate: {
            validator: (v) => Array.isArray(v) && v.length > 0,
            message: 'Invoice must have at least one item'
        }
    },
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    discountAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    netAmount: {
        type: Number,
        required: true,
        min: 0
    },
    dueDate: {
        type: Date,
        required: [true, 'Due date is required']
    },
    status: {
        type: String,
        enum: ['draft', 'issued', 'partially-paid', 'paid', 'overdue', 'cancelled'],
        default: 'draft',
        index: true
    },
    academicYear: {
        type: String,
        required: true,
        trim: true
    },
    term: {
        type: String,
        trim: true
    },
    issuedAt: {
        type: Date
    },
    paidAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 1000
    },
    cancelledAt: {
        type: Date
    },
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    cancelReason: {
        type: String,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

invoiceSchema.index({ school: 1, student: 1, status: 1 });
invoiceSchema.index({ school: 1, academicYear: 1, status: 1 });
invoiceSchema.index({ school: 1, dueDate: 1, status: 1 });
invoiceSchema.index({ school: 1, invoiceNumber: 1 }, { unique: true });

// Auto-calculate balance before save
invoiceSchema.pre('save', function (next) {
    this.balance = Math.max(0, this.netAmount - this.paidAmount);
    if (this.balance === 0 && this.paidAmount > 0 && this.status !== 'cancelled') {
        this.status = 'paid';
    } else if (this.paidAmount > 0 && this.balance > 0 && this.status !== 'cancelled') {
        this.status = 'partially-paid';
    }
    next();
});

invoiceSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('Invoice', invoiceSchema);
