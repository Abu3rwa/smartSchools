import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { CALENDAR_EVENT_CATEGORIES } from './CalendarEvent.js';

const defaultCategoriesEnabled = () => [...CALENDAR_EVENT_CATEGORIES];

const calendarNotificationPreferenceSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    enabled: {
        type: Boolean,
        default: true
    },
    categoriesEnabled: [{
        type: String,
        enum: CALENDAR_EVENT_CATEGORIES
    }],
    mutedEventIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CalendarEvent'
    }]
}, {
    timestamps: true
});

calendarNotificationPreferenceSchema.index({ school: 1, user: 1 }, { unique: true });

calendarNotificationPreferenceSchema.pre('save', function(next) {
    if (!Array.isArray(this.categoriesEnabled) || this.categoriesEnabled.length === 0) {
        this.categoriesEnabled = defaultCategoriesEnabled();
    }
    next();
});

calendarNotificationPreferenceSchema.plugin(tenantIsolationPlugin);

calendarNotificationPreferenceSchema.statics.defaultCategoriesEnabled = defaultCategoriesEnabled;

const CalendarNotificationPreference = mongoose.model(
    'CalendarNotificationPreference',
    calendarNotificationPreferenceSchema
);

export default CalendarNotificationPreference;
