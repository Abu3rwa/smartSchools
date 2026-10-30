import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const supportRespondentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    kind: {
        type: String,
        enum: ['internal_teacher', 'external_teacher', 'parent'],
        required: true,
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        required: function required() { return this.kind === 'internal_teacher'; },
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        default: null,
        required: function required() { return this.kind === 'parent'; },
    },
    parentUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: {
        type: String,
        trim: true,
        maxlength: 120,
        default: '',
        required: function required() { return this.kind === 'external_teacher'; },
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 200,
        default: '',
        required: function required() { return this.kind === 'external_teacher'; },
    },
    // Only a hash is stored; the last two digits let support confirm a code without revealing it.
    codeHash: { type: String, required: true, select: false },
    codeHint: { type: String, required: true, maxlength: 2 },
    codeIssuedAt: { type: Date, default: Date.now },
    codeDeliveredAt: { type: Date, default: null },
    lastAccessAt: { type: Date, default: null },
    failedAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    active: { type: Boolean, default: true },
}, { timestamps: true });

supportRespondentSchema.plugin(tenantIsolationPlugin);
supportRespondentSchema.index(
    { school: 1, teacher: 1 },
    {
        unique: true,
        partialFilterExpression: { kind: 'internal_teacher', teacher: { $type: 'objectId' } },
    },
);
supportRespondentSchema.index(
    { school: 1, email: 1 },
    {
        unique: true,
        partialFilterExpression: { kind: 'external_teacher', email: { $type: 'string' } },
    },
);
supportRespondentSchema.index(
    { school: 1, student: 1 },
    {
        unique: true,
        partialFilterExpression: { kind: 'parent', student: { $type: 'objectId' } },
    },
);

export default mongoose.model('SupportRespondent', supportRespondentSchema);
