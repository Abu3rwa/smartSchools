import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

/**
 * TeacherAbsence - Tracks when a teacher is absent on a given date.
 * Used by the substitution feature to exclude absent teachers from candidate lists
 * and to know when coverage is needed.
 */
const teacherAbsenceSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    reason: {
        type: String,
        trim: true,
        maxlength: 500
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

teacherAbsenceSchema.index({ school: 1, date: 1 });
teacherAbsenceSchema.index({ school: 1, teacher: 1, date: 1 }, { unique: true });

teacherAbsenceSchema.plugin(tenantIsolationPlugin);

const TeacherAbsence = mongoose.model('TeacherAbsence', teacherAbsenceSchema);
export default TeacherAbsence;
