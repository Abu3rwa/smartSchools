import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const ASSIGNMENT_STATUS = ['PENDING', 'CONFIRMED', 'DECLINED'];
const REQUEST_STATUS = ['SUBMITTED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'EXPIRED'];

const periodInfoSchema = new mongoose.Schema({
    periodId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TimetablePeriod',
        required: true
    },
    startTime: String,
    endTime: String,
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }
}, { _id: false });

const assignmentSchema = new mongoose.Schema({
    periodId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TimetablePeriod',
        required: true
    },
    substituteTeacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ASSIGNMENT_STATUS,
        default: 'PENDING'
    },
    teacherResponseNote: {
        type: String,
        trim: true,
        maxlength: 1000
    }
}, { _id: true });

const timelineEventSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true
    },
    by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    at: {
        type: Date,
        default: Date.now
    },
    meta: {
        type: mongoose.Schema.Types.Mixed
    }
}, { _id: false });

const substitutionRequestSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        default: null
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    absentTeacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    coverageType: {
        type: String,
        enum: ['SINGLE_TEACHER_ALL_PERIODS', 'PER_PERIOD'],
        required: true
    },
    periods: [periodInfoSchema],
    assignments: [assignmentSchema],
    principalNote: {
        type: String,
        trim: true,
        maxlength: 2000
    },
    materialsLink: {
        type: String,
        trim: true,
        maxlength: 2000
    },
    status: {
        type: String,
        enum: REQUEST_STATUS,
        default: 'SUBMITTED',
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },
    timeline: [timelineEventSchema],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

substitutionRequestSchema.index({ school: 1, date: 1 });
substitutionRequestSchema.index({ school: 1, date: 1, absentTeacherId: 1 });
substitutionRequestSchema.index({ school: 1, date: 1, 'assignments.periodId': 1, 'assignments.substituteTeacherId': 1 });

substitutionRequestSchema.plugin(tenantIsolationPlugin);

const SubstitutionRequest = mongoose.model('SubstitutionRequest', substitutionRequestSchema);
export default SubstitutionRequest;
export { REQUEST_STATUS, ASSIGNMENT_STATUS };
