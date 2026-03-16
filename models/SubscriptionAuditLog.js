import mongoose from 'mongoose';

const subscriptionAuditLogSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    subscription: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        required: true,
        index: true
    },
    action: {
        type: String,
        enum: ['manual_renewal'],
        required: true
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    details: {
        cycles: {
            type: Number,
            default: 1
        },
        amount: {
            type: Number,
            default: 0
        },
        currency: {
            type: String,
            default: 'USD'
        },
        previousStatus: {
            type: String,
            default: ''
        },
        renewedStatus: {
            type: String,
            default: ''
        },
        previousPeriodEnd: {
            type: Date,
            default: null
        },
        renewedUntil: {
            type: Date,
            default: null
        },
        note: {
            type: String,
            default: ''
        }
    }
}, {
    timestamps: true
});

subscriptionAuditLogSchema.index({ school: 1, createdAt: -1 });
subscriptionAuditLogSchema.index({ subscription: 1, createdAt: -1 });

const SubscriptionAuditLog = mongoose.model('SubscriptionAuditLog', subscriptionAuditLogSchema);

export default SubscriptionAuditLog;
