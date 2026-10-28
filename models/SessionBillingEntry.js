import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const ruleSnapshotSchema = new mongoose.Schema({
    attendanceMinutes: { type: Number, default: 0 },
    pausedMinutes: { type: Number, default: 0 },
    rawMinutes: { type: Number, default: 0 },
    roundedMinutes: { type: Number, default: 0 },
    roundingMinutes: { type: Number, default: 0 },
    minimumBillableMinutes: { type: Number, default: 0 },
    noShowMinutes: { type: Number, default: 0 },
    graceMinutes: { type: Number, default: 0 },
    billingBasis: { type: String, default: '' },
    packageName: { type: String, default: '' }
}, { _id: false });

const sessionBillingEntrySchema = new mongoose.Schema({
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
    studentUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    kind: {
        type: String,
        enum: ['charge', 'payment', 'refund', 'adjustment'],
        required: true,
        index: true
    },
    // Adjustments move the balance up (credit) or down (debit). Payments and
    // refunds always move it in their own direction, so this stays empty.
    direction: {
        type: String,
        enum: ['credit', 'debit', ''],
        default: ''
    },
    // Session charges are anchored to a session so the same session can never
    // bill twice. Manual charges for lessons held elsewhere leave this empty.
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LiveSession'
    },
    sessionTitle: {
        type: String,
        trim: true,
        maxlength: 300
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        index: true
    },
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    occurredAt: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
    minutes: {
        type: Number,
        min: 0
    },
    hourlyRate: {
        type: Number,
        min: 0
    },
    rateSource: {
        type: String,
        enum: ['student', 'class', 'school', 'package']
    },
    // The undiscounted value of the lesson before a package covered part of it.
    grossAmount: {
        type: Number,
        min: 0
    },
    amount: {
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
    // Minutes drawn from a prepaid package for this lesson.
    packageCoveredMinutes: {
        type: Number,
        min: 0,
        default: 0
    },
    packagePurchase: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SessionBillingPackagePurchase'
    },
    method: {
        type: String,
        enum: ['cash', 'bank-transfer', 'cheque', 'online', 'other']
    },
    reference: {
        type: String,
        trim: true,
        maxlength: 200
    },
    receivedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Who logged a manual entry; teachers are limited to their own entries.
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    note: {
        type: String,
        trim: true,
        maxlength: 500
    },
    source: {
        type: String,
        enum: ['auto', 'manual'],
        default: 'auto'
    },
    lessonSource: {
        type: String,
        enum: ['platform', 'zoom', 'in-person', 'other', 'manual'],
        default: 'platform'
    },
    ruleSnapshot: {
        type: ruleSnapshotSchema,
        default: null
    },
    linkedEntry: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SessionBillingEntry'
    },
    status: {
        type: String,
        enum: ['active', 'void'],
        default: 'active',
        index: true
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
        trim: true,
        maxlength: 300
    }
}, {
    timestamps: true
});

sessionBillingEntrySchema.index({ school: 1, student: 1, occurredAt: -1 });
sessionBillingEntrySchema.index({ school: 1, kind: 1, occurredAt: -1 });
sessionBillingEntrySchema.index({ school: 1, occurredAt: -1 });
sessionBillingEntrySchema.index({ school: 1, createdBy: 1, occurredAt: -1 });
sessionBillingEntrySchema.index(
    { session: 1, student: 1 },
    {
        name: 'session_charge_unique',
        unique: true,
        // Manual charges have no session; only session-anchored charges are
        // one-per-student, so off-platform lessons never collide with each other.
        partialFilterExpression: { kind: 'charge', status: 'active', session: { $exists: true } }
    }
);

sessionBillingEntrySchema.plugin(tenantIsolationPlugin);

export default mongoose.model('SessionBillingEntry', sessionBillingEntrySchema);
