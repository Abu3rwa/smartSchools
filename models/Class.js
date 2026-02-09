import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const classSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Class name is required'],
        trim: true
    },
    grade: {
        type: Number,
        required: [true, 'Grade level is required'],
        min: 1,
        max: 12
    },
    section: {
        type: String,
        trim: true,
        uppercase: true
    },
    academicYear: {
        type: String,
        required: [true, 'Academic year is required']
    },
    // Class teacher
    classTeacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Teacher'
    },
    // Subjects taught in this class with their teachers
    subjects: [{
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject',
            required: true
        },
        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Teacher',
            required: true
        }
    }],
    // Room/Location
    room: {
        type: String,
        trim: true
    },
    capacity: {
        type: Number,
        default: 40
    },
    schedule: {
        startTime: String,
        endTime: String,
        days: [{
            type: String,
            enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        }]
    },
    isActive: {
        type: Boolean,
        default: true
    },
    description: String
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
classSchema.index({ school: 1, grade: 1, section: 1, academicYear: 1 }, { unique: true });
classSchema.index({ classTeacher: 1 });
classSchema.index({ academicYear: 1 });

// Virtual to get student count
classSchema.virtual('students', {
    ref: 'Student',
    localField: '_id',
    foreignField: 'currentClass',
    count: true
});

classSchema.virtual('studentList', {
    ref: 'Student',
    localField: '_id',
    foreignField: 'currentClass'
});

// Generate class name from grade and section
classSchema.pre('save', function (next) {
    if (this.isModified('grade') || this.isModified('section')) {
        this.name = `Grade ${this.grade}${this.section ? '-' + this.section : ''}`;
    }
    next();
});

// Apply tenant isolation plugin
classSchema.plugin(tenantIsolationPlugin);

const Class = mongoose.model('Class', classSchema);
export default Class;
