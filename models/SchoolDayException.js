import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const schoolDayExceptionSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    isWorkingDay: {
        type: Boolean,
        required: true
    },
    reason: {
        type: String,
        trim: true,
        maxlength: 250
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

schoolDayExceptionSchema.index({ school: 1, date: 1 }, { unique: true });

schoolDayExceptionSchema.pre('validate', function(next) {
    if (this.date) {
        const normalized = new Date(this.date);
        normalized.setHours(0, 0, 0, 0);
        this.date = normalized;
    }
    next();
});

schoolDayExceptionSchema.plugin(tenantIsolationPlugin);

const SchoolDayException = mongoose.model('SchoolDayException', schoolDayExceptionSchema);
export default SchoolDayException;
