import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const studentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    studentId: {
        type: String,
        required: [true, 'Student ID is required']
    },
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true
    },
    dateOfBirth: {
        type: Date,
        required: [true, 'Date of birth is required']
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        unique: true,
        sparse: true // Allows multiple null values
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
        required: true
    },
    // Current class enrollment
    currentClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class'
    },
    enrollmentDate: {
        type: Date,
        default: Date.now
    },
    academicYear: {
        type: String,
        required: true
    },
    // Parent/Guardian Information
    parentInfo: {
        fatherName: {
            type: String,
            trim: true
        },
        fatherPhone: String,
        fatherEmail: String,
        fatherOccupation: String,
        motherName: {
            type: String,
            trim: true
        },
        motherPhone: String,
        motherEmail: String,
        motherOccupation: String,
        guardianName: String,
        guardianPhone: String,
        guardianEmail: String,
        guardianRelation: String,
        primaryContact: {
            type: String,
            enum: ['father', 'mother', 'guardian'],
            default: 'father'
        }
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: {
            type: String,
            default: 'South Africa'
        }
    },
    // Medical information
    medicalInfo: {
        bloodGroup: String,
        allergies: [String],
        medications: [String],
        emergencyContact: {
            name: String,
            phone: String,
            relationship: String
        }
    },
    // Academic history
    previousSchool: {
        name: String,
        lastGrade: String,
        leavingDate: Date
    },
    // Optional student email (separate from parent emails)
    studentEmail: {
        type: String,
        trim: true,
        lowercase: true
    },
    // Report preferences for AI reporting system
    reportPreferences: {
        language: {
            type: String,
            enum: ['english', 'arabic', 'bilingual'],
            default: 'english'
        },
        frequency: {
            type: String,
            enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
            default: 'monthly'
        },
        recipients: {
            student: { type: Boolean, default: false },
            mother: { type: Boolean, default: true },
            father: { type: Boolean, default: true },
            teacher: { type: Boolean, default: true }
        },
        sendEmail: {
            type: Boolean,
            default: true
        }
    },
    // Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'transferred', 'graduated', 'suspended'],
        default: 'active'
    },
    notes: String
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
studentSchema.index({ school: 1, studentId: 1 }, { unique: true });
studentSchema.index({ currentClass: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ 'parentInfo.fatherEmail': 1 });
studentSchema.index({ 'parentInfo.motherEmail': 1 });

// Virtual for full name
studentSchema.virtual('fullName').get(function () {
    return `${this.firstName} ${this.lastName}`;
});

// Virtual for age
studentSchema.virtual('age').get(function () {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
});

// Get primary contact info
studentSchema.methods.getPrimaryContact = function () {
    const primary = this.parentInfo.primaryContact;
    switch (primary) {
        case 'father':
            return {
                name: this.parentInfo.fatherName,
                phone: this.parentInfo.fatherPhone,
                email: this.parentInfo.fatherEmail
            };
        case 'mother':
            return {
                name: this.parentInfo.motherName,
                phone: this.parentInfo.motherPhone,
                email: this.parentInfo.motherEmail
            };
        case 'guardian':
            return {
                name: this.parentInfo.guardianName,
                phone: this.parentInfo.guardianPhone,
                email: this.parentInfo.guardianEmail
            };
        default:
            return null;
    }
};

// Apply tenant isolation plugin
studentSchema.plugin(tenantIsolationPlugin);

const Student = mongoose.model('Student', studentSchema);
export default Student;
