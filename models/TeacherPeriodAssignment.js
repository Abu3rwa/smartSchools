import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { normalizeWeekWorkingDays } from '../utils/schoolWeekWorkingDays.js';

const teacherPeriodAssignmentSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true,
        index: true
    },
    grade: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
        index: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        index: true
    },
    room: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room'
    },
    period: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TimetablePeriod',
        required: true,
        index: true
    },
    daysOfWeek: [{
        type: Number,
        min: 0,
        max: 6
    }],
    startDate: {
        type: Date,
        required: true,
        index: true
    },
    endDate: {
        type: Date,
        required: true,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

teacherPeriodAssignmentSchema.index({ school: 1, teacher: 1, period: 1, startDate: 1, endDate: 1 });
teacherPeriodAssignmentSchema.index({ school: 1, class: 1, period: 1, startDate: 1, endDate: 1 });

teacherPeriodAssignmentSchema.pre('validate', function(next) {
    if (this.startDate && this.endDate) {
        const s = new Date(this.startDate);
        s.setHours(0, 0, 0, 0);
        const e = new Date(this.endDate);
        e.setHours(23, 59, 59, 999);
        this.startDate = s;
        this.endDate = e;

        if (this.startDate > this.endDate) {
            this.invalidate('endDate', 'endDate must be on or after startDate');
        }
    }

    this.daysOfWeek = normalizeWeekWorkingDays(this.daysOfWeek, []);

    next();
});

teacherPeriodAssignmentSchema.plugin(tenantIsolationPlugin);

const TeacherPeriodAssignment = mongoose.model('TeacherPeriodAssignment', teacherPeriodAssignmentSchema);
export default TeacherPeriodAssignment;
