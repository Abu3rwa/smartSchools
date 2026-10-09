import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

// Links one app class + subject + academic year to a Google Classroom course owned by a teacher's Google account.
const classroomCourseMappingSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: true
        },
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject',
            required: true
        },
        academicYear: {
            type: String,
            required: true,
            trim: true
        },
        courseId: {
            type: String,
            required: true,
            trim: true
        },
        courseName: {
            type: String,
            trim: true,
            maxlength: 300,
            default: ''
        },
        courseSection: {
            type: String,
            trim: true,
            maxlength: 300,
            default: ''
        },
        mappedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        googleEmail: {
            type: String,
            trim: true,
            lowercase: true,
            default: ''
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

// A mapping belongs to the teacher who created it; another teacher maps their own course.
classroomCourseMappingSchema.index(
    { school: 1, class: 1, subject: 1, academicYear: 1, mappedBy: 1 },
    { unique: true }
);
classroomCourseMappingSchema.index({ school: 1, mappedBy: 1, isActive: 1 });

classroomCourseMappingSchema.plugin(tenantIsolationPlugin);

const ClassroomCourseMapping = mongoose.model('ClassroomCourseMapping', classroomCourseMappingSchema);

export default ClassroomCourseMapping;
