import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

export const CALENDAR_EVENT_CATEGORIES = ['EVENT', 'HOLIDAY', 'MEETING', 'EXAM'];
export const CALENDAR_EVENT_VISIBILITIES = ['SCHOOL_WIDE', 'TEACHERS_ONLY', 'PARENTS_ONLY', 'CUSTOM'];
export const CALENDAR_EVENT_STATUSES = ['ACTIVE', 'CANCELLED'];
export const CALENDAR_EVENT_RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'];

const calendarAudienceSchema = new mongoose.Schema({
    visibility: {
        type: String,
        enum: CALENDAR_EVENT_VISIBILITIES,
        default: 'SCHOOL_WIDE'
    },
    userIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    emails: [{
        type: String,
        lowercase: true,
        trim: true
    }],
    teacherIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    classIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class'
    }],
    gradeIds: [{
        type: Number,
        min: 1,
        max: 12
    }]
}, { _id: false });

const calendarRecurrenceSchema = new mongoose.Schema({
    isRecurring: {
        type: Boolean,
        default: false
    },
    frequency: {
        type: String,
        enum: CALENDAR_EVENT_RECURRENCE_FREQUENCIES
    },
    interval: {
        type: Number,
        min: 1,
        max: 52,
        default: 1
    },
    weekDays: [{
        type: Number,
        min: 0,
        max: 6
    }],
    until: {
        type: Date
    }
}, { _id: false });

const calendarEventSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: [true, 'title is required'],
        trim: true,
        maxlength: [160, 'title cannot exceed 160 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [2000, 'description cannot exceed 2000 characters']
    },
    category: {
        type: String,
        enum: CALENDAR_EVENT_CATEGORIES,
        required: [true, 'category is required'],
        index: true
    },
    startAt: {
        type: Date,
        required: [true, 'startAt is required'],
        index: true
    },
    endAt: {
        type: Date,
        required: [true, 'endAt is required'],
        validate: {
            validator(value) {
                if (!this.startAt || !value) return true;
                return value >= this.startAt;
            },
            message: 'endAt must be greater than or equal to startAt'
        }
    },
    allDay: {
        type: Boolean,
        default: true
    },
    location: {
        type: String,
        trim: true,
        maxlength: [220, 'location cannot exceed 220 characters']
    },
    audience: {
        type: calendarAudienceSchema,
        default: () => ({ visibility: 'SCHOOL_WIDE' })
    },
    recurrence: {
        type: calendarRecurrenceSchema,
        default: () => ({ isRecurring: false }),
        validate: {
            validator(value) {
                if (!value || value.isRecurring !== true) return true;
                if (!value.frequency || !CALENDAR_EVENT_RECURRENCE_FREQUENCIES.includes(value.frequency)) {
                    return false;
                }
                if (!Number.isInteger(value.interval) || value.interval < 1 || value.interval > 52) {
                    return false;
                }
                if (value.frequency === 'WEEKLY' && (!Array.isArray(value.weekDays) || value.weekDays.length === 0)) {
                    return false;
                }
                if (Array.isArray(value.weekDays) && value.weekDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
                    return false;
                }
                if (value.until && this.startAt && value.until < this.startAt) {
                    return false;
                }
                return true;
            },
            message: 'Invalid recurrence configuration'
        }
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        enum: CALENDAR_EVENT_STATUSES,
        default: 'ACTIVE',
        index: true
    }
}, {
    timestamps: true
});

calendarEventSchema.index({ school: 1, startAt: 1 });
calendarEventSchema.index({ school: 1, category: 1, startAt: 1 });
calendarEventSchema.index({ school: 1, 'audience.visibility': 1, startAt: 1 });
calendarEventSchema.index({ school: 1, 'audience.userIds': 1, startAt: 1 });
calendarEventSchema.index({ school: 1, status: 1, startAt: 1 });
calendarEventSchema.index({ school: 1, 'recurrence.isRecurring': 1, startAt: 1 });

calendarEventSchema.plugin(tenantIsolationPlugin);

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
export default CalendarEvent;
