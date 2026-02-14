import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const attendanceRequestTypeSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    labelEn: {
        type: String,
        required: [true, 'English label is required'],
        trim: true
    },
    labelAr: {
        type: String,
        trim: true,
        default: ''
    },
    code: {
        type: String,
        trim: true,
        lowercase: true
    },
    order: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    requiresProof: {
        type: Boolean,
        default: false
    },
    useDateRange: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

attendanceRequestTypeSchema.index({ school: 1, isActive: 1, order: 1 });
attendanceRequestTypeSchema.plugin(tenantIsolationPlugin);

const AttendanceRequestType = mongoose.model('AttendanceRequestType', attendanceRequestTypeSchema);
export default AttendanceRequestType;
