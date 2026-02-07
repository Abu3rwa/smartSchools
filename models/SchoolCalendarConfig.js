import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const schoolCalendarConfigSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
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
    if (!this.weekWorkingDays || this.weekWorkingDays.length === 0) {
        this.weekWorkingDays = [1, 2, 3, 4, 5];
    }
    this.weekWorkingDays = Array.from(new Set(this.weekWorkingDays)).sort((a, b) => a - b);
    next();
});

schoolCalendarConfigSchema.plugin(tenantIsolationPlugin);

const SchoolCalendarConfig = mongoose.model('SchoolCalendarConfig', schoolCalendarConfigSchema);
export default SchoolCalendarConfig;
