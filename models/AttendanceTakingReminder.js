import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const attendanceTakingReminderSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    schedule: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Schedule',
        required: true,
        index: true
    },
    /** Date of the class (YYYY-MM-DD) for which attendance was missed */
    attendanceDate: {
        type: Date,
        required: true,
        index: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    /** sent | failed */
    status: {
        type: String,
        enum: ['sent', 'failed'],
        required: true,
        default: 'sent'
    },
    sentAt: {
        type: Date,
        default: Date.now
    },
    /** If status is failed, optional reason */
    failureReason: {
        type: String
    },
    /** Reference to the Notification document created for this reminder */
    notification: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Notification'
    }
}, {
    timestamps: true
});

attendanceTakingReminderSchema.index({ schedule: 1, attendanceDate: 1 }, { unique: true });
attendanceTakingReminderSchema.index({ school: 1, attendanceDate: -1 });
attendanceTakingReminderSchema.index({ teacher: 1, sentAt: -1 });

attendanceTakingReminderSchema.plugin(tenantIsolationPlugin);

const AttendanceTakingReminder = mongoose.model('AttendanceTakingReminder', attendanceTakingReminderSchema);
export default AttendanceTakingReminder;
