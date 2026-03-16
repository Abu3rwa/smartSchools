import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const channelsSchema = new mongoose.Schema({
    inApp: {
        type: Boolean,
        default: true
    },
    email: {
        type: Boolean,
        default: false
    },
    push: {
        type: Boolean,
        default: false
    }
}, { _id: false });

const classOverrideSchema = new mongoose.Schema({
    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    enabled: {
        type: Boolean,
        default: true
    },
    onTaskCompleted: {
        type: Boolean,
        default: true
    },
    onObjectiveMastered: {
        type: Boolean,
        default: true
    },
    onStudentStruggling: {
        type: Boolean,
        default: true
    },
    channels: {
        type: channelsSchema,
        default: () => ({})
    }
}, { _id: false });

const studentOverrideSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    enabled: {
        type: Boolean,
        default: true
    },
    onTaskCompleted: {
        type: Boolean,
        default: true
    },
    onObjectiveMastered: {
        type: Boolean,
        default: true
    },
    onStudentStruggling: {
        type: Boolean,
        default: true
    }
}, { _id: false });

const academicExcellenceNotificationPreferenceSchema = new mongoose.Schema({
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
    global: {
        enabled: {
            type: Boolean,
            default: true
        },
        onTaskCompleted: {
            type: Boolean,
            default: true
        },
        onObjectiveMastered: {
            type: Boolean,
            default: true
        },
        onStudentStruggling: {
            type: Boolean,
            default: true
        },
        onWeeklyDigest: {
            type: Boolean,
            default: true
        },
        channels: {
            type: channelsSchema,
            default: () => ({})
        }
    },
    classOverrides: {
        type: [classOverrideSchema],
        default: []
    },
    studentOverrides: {
        type: [studentOverrideSchema],
        default: []
    }
}, {
    timestamps: true
});

academicExcellenceNotificationPreferenceSchema.index(
    { school: 1, teacher: 1 },
    { unique: true }
);

academicExcellenceNotificationPreferenceSchema.plugin(tenantIsolationPlugin);

const AcademicExcellenceNotificationPreference = mongoose.model(
    'AcademicExcellenceNotificationPreference',
    academicExcellenceNotificationPreferenceSchema
);

export default AcademicExcellenceNotificationPreference;
