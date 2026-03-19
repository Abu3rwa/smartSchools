import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const academicExcellenceExclusionSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    academicYear: {
        type: String,
        default: null,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    scopeType: {
        type: String,
        enum: ['lesson', 'objective', 'subject'],
        required: true,
        index: true
    },
    lessonPlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LessonPlan',
        default: null
    },
    objectiveKey: {
        type: String,
        default: '',
        trim: true,
        index: true
    },
    subjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        default: null
    },
    targetType: {
        type: String,
        enum: ['all_students', 'class', 'student'],
        required: true,
        index: true
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        default: null
    },
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        default: null
    },
    reason: {
        type: String,
        default: '',
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    activatedAt: {
        type: Date,
        default: Date.now
    },
    deactivatedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

academicExcellenceExclusionSchema.index({ school: 1, scopeType: 1, targetType: 1, isActive: 1 });
academicExcellenceExclusionSchema.index({ school: 1, academicYear: 1, isActive: 1 });
academicExcellenceExclusionSchema.index({ school: 1, classId: 1, studentId: 1, isActive: 1 });

academicExcellenceExclusionSchema.plugin(tenantIsolationPlugin);

const AcademicExcellenceExclusion = mongoose.model(
    'AcademicExcellenceExclusion',
    academicExcellenceExclusionSchema
);

export default AcademicExcellenceExclusion;
