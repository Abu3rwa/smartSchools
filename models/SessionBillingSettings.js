import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const rateFields = {
    hourlyRate: {
        type: Number,
        required: true,
        min: 0
    },
    effectiveFrom: {
        type: Date,
        default: null
    },
    effectiveTo: {
        type: Date,
        default: null
    },
    reason: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ''
    }
};

const classRateSchema = new mongoose.Schema({
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    ...rateFields
}, { _id: false });

const studentRateSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    ...rateFields
}, { _id: false });

const statementSchema = new mongoose.Schema({
    defaultLanguage: {
        type: String,
        enum: ['en', 'ar', 'both'],
        default: 'en'
    },
    emailSubject: {
        type: String,
        trim: true,
        maxlength: 160,
        default: ''
    },
    paymentInstructions: {
        type: String,
        trim: true,
        maxlength: 800,
        default: ''
    },
    includeContact: {
        type: Boolean,
        default: true
    },
    ccAdminOnFailure: {
        type: Boolean,
        default: true
    }
}, { _id: false });

const reminderSchema = new mongoose.Schema({
    enabled: {
        type: Boolean,
        default: false
    },
    afterDays: {
        type: Number,
        min: 1,
        max: 120,
        default: 7
    },
    quietDays: {
        type: Number,
        min: 1,
        max: 120,
        default: 7
    },
    minimumBalance: {
        type: Number,
        min: 0,
        default: 1
    },
    lowCreditMinutes: {
        type: Number,
        min: 0,
        max: 6000,
        default: 60
    },
    packageExpiryDays: {
        type: Number,
        min: 1,
        max: 120,
        default: 14
    }
}, { _id: false });

const sessionBillingSettingsSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        unique: true,
        index: true
    },
    currency: {
        type: String,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
        default: 'USD'
    },
    defaultHourlyRate: {
        type: Number,
        min: 0,
        default: 0
    },
    roundingMinutes: {
        type: Number,
        enum: [1, 5, 10, 15],
        default: 5
    },
    minimumBillableMinutes: {
        type: Number,
        min: 0,
        max: 600,
        default: 15
    },
    noShowMinutes: {
        type: Number,
        min: 0,
        max: 600,
        default: 0
    },
    lateCancellationMinutes: {
        type: Number,
        min: 0,
        max: 600,
        default: 0
    },
    graceMinutes: {
        type: Number,
        min: 0,
        max: 60,
        default: 0
    },
    // Sessions bill each student from their own join/leave times by default;
    // whole-session billing charges every roster student the session length.
    billingBasis: {
        type: String,
        enum: ['individual', 'session'],
        default: 'individual'
    },
    excludePauseTime: {
        type: Boolean,
        default: true
    },
    classRates: {
        type: [classRateSchema],
        default: []
    },
    studentRates: {
        type: [studentRateSchema],
        default: []
    },
    enabledPaymentMethods: {
        type: [String],
        enum: ['cash', 'bank-transfer', 'cheque', 'online', 'other'],
        default: ['cash', 'bank-transfer', 'cheque', 'online', 'other']
    },
    packagesEnabled: {
        type: Boolean,
        default: true
    },
    statement: {
        type: statementSchema,
        default: () => ({})
    },
    reminder: {
        type: reminderSchema,
        default: () => ({})
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

sessionBillingSettingsSchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SessionBillingSettings', sessionBillingSettingsSchema);
