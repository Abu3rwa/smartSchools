import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const timetablePeriodSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50
    },
    startTime: {
        type: String,
        required: true,
        match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
    },
    endTime: {
        type: String,
        required: true,
        match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
    },
    order: {
        type: Number,
        default: 0,
        min: 0
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

timetablePeriodSchema.index({ school: 1, name: 1 }, { unique: true });
timetablePeriodSchema.index({ school: 1, order: 1 });

timetablePeriodSchema.pre('validate', function(next) {
    if (this.startTime && this.endTime) {
        const [sh, sm] = this.startTime.split(':').map(Number);
        const [eh, em] = this.endTime.split(':').map(Number);
        const startMinutes = sh * 60 + sm;
        const endMinutes = eh * 60 + em;
        if (startMinutes >= endMinutes) {
            this.invalidate('endTime', 'End time must be after start time');
        }
    }
    next();
});

timetablePeriodSchema.plugin(tenantIsolationPlugin);

const TimetablePeriod = mongoose.model('TimetablePeriod', timetablePeriodSchema);
export default TimetablePeriod;
