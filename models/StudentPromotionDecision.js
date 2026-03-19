import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const studentPromotionDecisionSchema = new mongoose.Schema({
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
    sourceAcademicYear: {
        type: String,
        required: true,
        trim: true
    },
    targetAcademicYear: {
        type: String,
        trim: true,
        default: null
    },
    sourceClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        default: null
    },
    targetClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        default: null
    },
    decisionType: {
        type: String,
        enum: ['promote', 'retain', 'promote_with_conditions', 'hold_review'],
        required: true,
        index: true
    },
    reasonCode: {
        type: String,
        required: true,
        trim: true
    },
    note: {
        type: String,
        trim: true,
        default: ''
    },
    conditions: {
        type: String,
        trim: true,
        default: ''
    },
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    policySnapshot: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    }
}, {
    timestamps: true
});

studentPromotionDecisionSchema.index({ school: 1, student: 1, createdAt: -1 });
studentPromotionDecisionSchema.index({ school: 1, sourceAcademicYear: 1, decisionType: 1, approvalStatus: 1 });

studentPromotionDecisionSchema.plugin(tenantIsolationPlugin);

const StudentPromotionDecision = mongoose.model('StudentPromotionDecision', studentPromotionDecisionSchema);
export default StudentPromotionDecision;