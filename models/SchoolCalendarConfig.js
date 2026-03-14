import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import { DEFAULT_WEEK_WORKING_DAYS, normalizeWeekWorkingDays } from '../utils/schoolWeekWorkingDays.js';

const schoolCalendarConfigSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    timezone: {
        type: String,
        trim: true,
        default: 'UTC'
    },
    weekWorkingDays: [{
        type: Number,
        min: 0,
        max: 6
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

schoolCalendarConfigSchema.index({ school: 1 }, { unique: true });

schoolCalendarConfigSchema.pre('save', function(next) {
    this.weekWorkingDays = normalizeWeekWorkingDays(this.weekWorkingDays, DEFAULT_WEEK_WORKING_DAYS);
    next();
});

schoolCalendarConfigSchema.plugin(tenantIsolationPlugin);

const SchoolCalendarConfig = mongoose.model('SchoolCalendarConfig', schoolCalendarConfigSchema);
export default SchoolCalendarConfig;
