import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const attendanceRequestSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    // Requester
    requester: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    requesterName: {
        type: String,
        required: true,
        trim: true
    },
    requesterEmail: {
        type: String,
        required: true,
        trim: true
    },
    requesterRole: {
        type: String,
        enum: ['teacher', 'parent', 'student', 'admin'],
        required: true
    },
    // Context (staff vs student)
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        default: null
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        default: null
    },
    // Form data
    requestType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AttendanceRequestType',
        required: true
    },
    requestDate: {
        type: Date,
        default: null
    },
    startDate: {
        type: Date,
        default: null
    },
    endDate: {
        type: Date,
        default: null
    },
    fromTime: {
        type: String,
        trim: true,
        default: ''
    },
    toTime: {
        type: String,
        trim: true,
        default: ''
    },
    departmentOrSupervisor: {
        type: String,
        trim: true,
        default: ''
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    attachmentUrl: {
        type: String,
        trim: true,
        default: null
    },
    // Workflow
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    reviewNote: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

attendanceRequestSchema.index({ school: 1, status: 1 });
attendanceRequestSchema.index({ school: 1, requester: 1 });
attendanceRequestSchema.index({ reviewedBy: 1 });
attendanceRequestSchema.index({ createdAt: -1 });
attendanceRequestSchema.index({ school: 1, department: 1 });
attendanceRequestSchema.plugin(tenantIsolationPlugin);

const AttendanceRequest = mongoose.model('AttendanceRequest', attendanceRequestSchema);
export default AttendanceRequest;
