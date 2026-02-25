import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

export const CALENDAR_EVENT_CATEGORIES = ['EVENT', 'HOLIDAY', 'MEETING', 'EXAM'];
export const CALENDAR_EVENT_VISIBILITIES = ['SCHOOL_WIDE', 'TEACHERS_ONLY', 'PARENTS_ONLY', 'CUSTOM'];
export const CALENDAR_EVENT_STATUSES = ['ACTIVE', 'CANCELLED'];

const calendarAudienceSchema = new mongoose.Schema({
    visibility: {
        type: String,
        enum: CALENDAR_EVENT_VISIBILITIES,
        default: 'SCHOOL_WIDE'
    },
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
calendarEventSchema.index({ school: 1, status: 1, startAt: 1 });

calendarEventSchema.plugin(tenantIsolationPlugin);

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
export default CalendarEvent;
