import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const teacherSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    employeeId: {
        type: String,
        required: [true, 'Employee ID is required']
    },
    department: {
        type: String,
        trim: true
    },
    qualification: {
        type: String,
        trim: true
    },
    specialization: {
        type: String,
        trim: true
    },
    joiningDate: {
        type: Date,
        default: Date.now
    },
    // Subjects this teacher can teach
    subjects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject'
    }],
    // Classes assigned to this teacher
    assignedClasses: [{
        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class'
        },
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject'
        },
        isClassTeacher: {
            type: Boolean,
            default: false
        }
    }],
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String
    },
    emergencyContact: {
        name: String,
        relationship: String,
        phone: String
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Index for faster queries
teacherSchema.index({ school: 1, employeeId: 1 }, { unique: true });
teacherSchema.index({ user: 1 });

// Virtual to get classes where teacher is class teacher
teacherSchema.virtual('classTeacherOf').get(function () {
    return this.assignedClasses.filter(ac => ac.isClassTeacher);
});

// Apply tenant isolation plugin
teacherSchema.plugin(tenantIsolationPlugin);

const Teacher = mongoose.model('Teacher', teacherSchema);
export default Teacher;
