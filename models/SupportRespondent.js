import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const supportRespondentSchema = new mongoose.Schema({
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    kind: {
        type: String,
        enum: ['internal_teacher', 'external_teacher', 'parent', 'student'],
        required: true,
    },
    // Which parent contact slot this participant represents. Two parents of the
    // same student hold separate codes and separate answers.
    parentSlot: {
        type: String,
        enum: ['mother', 'father', 'guardian', 'other', null],
        default: null,
    },
    // How the code reaches this participant. Printed and assisted deliveries are
    // recorded by staff; they never pretend an email was sent.
    deliveryMethod: {
        type: String,
        enum: ['email', 'printed', 'assisted', 'portal'],
        default: 'email',
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
        required: function required() { return ['parent', 'student'].includes(this.kind); },
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
    // Portal students authenticate normally and never need a code.
    codeHash: {
        type: String,
        required: function required() { return this.kind !== 'student'; },
        select: false,
    },
    codeHint: { type: String, required: true, maxlength: 2 },
    // Keyed HMAC of the current code, so a login is one indexed lookup rather
    // than scanning every respondent that shares the last two digits.
    codeLookup: { type: String, default: '', select: false },
    codeIssuedAt: { type: Date, default: Date.now },
    codeDeliveredAt: { type: Date, default: null },
    lastAccessAt: { type: Date, default: null },
    failedAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    // Bumped whenever a code is (re)issued so older access sessions die with it.
    tokenVersion: { type: Number, default: 0, min: 0 },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    active: { type: Boolean, default: true },
}, { timestamps: true });

supportRespondentSchema.plugin(tenantIsolationPlugin);
supportRespondentSchema.index(
    { codeLookup: 1 },
    {
        unique: true,
        partialFilterExpression: { codeLookup: { $type: 'string', $ne: '' } },
        name: 'one_respondent_per_code_lookup',
    },
);
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
    { school: 1, student: 1, parentSlot: 1 },
    {
        unique: true,
        partialFilterExpression: { kind: 'parent', student: { $type: 'objectId' } },
        name: 'one_parent_slot_per_student',
    },
);
supportRespondentSchema.index(
    { school: 1, student: 1 },
    {
        unique: true,
        partialFilterExpression: { kind: 'student', student: { $type: 'objectId' } },
        name: 'one_student_respondent',
    },
);

export default mongoose.model('SupportRespondent', supportRespondentSchema);
