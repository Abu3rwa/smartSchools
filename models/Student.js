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
        required: true
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
    // Department this student belongs to (e.g. Middle School, Primary)
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        default: null
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
    // Append-only history when student is promoted or moved to another class
    classEnrollmentHistory: [{
        academicYear: { type: String, required: true },
        class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
        enrolledAt: { type: Date, default: Date.now },
        leftAt: { type: Date }
    }],
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
    photoUrl: {
        type: String,
        default: null
    },
    notes: String,
    admissions: {
        studentType: {
            type: String,
            enum: ['returning', 'new', 'transfer'],
            default: 'returning'
        },
        reEnrollmentStatus: {
            type: String,
            enum: [
                'pending_contact',
                'documents_pending',
                'financial_clearance_pending',
                'approved_for_placement',
                'enrolled'
            ],
            default: 'pending_contact'
        },
        seatFreezeUntil: {
            type: Date,
            default: null
        },
        placementRecommendation: {
            grade: { type: Number, min: 1, max: 12, default: null },
            section: { type: String, trim: true, uppercase: true, default: null },
            note: { type: String, trim: true, default: '' }
        },
        lastStatusUpdatedAt: {
            type: Date,
            default: null
        },
        lastStatusUpdatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    }
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

studentSchema.methods.getAllContactEmailEntries = function () {
    const contacts = new Map();

    const addContact = ({ email, type, name }) => {
        if (!email || typeof email !== 'string') return;
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) return;

        if (!contacts.has(normalizedEmail)) {
            contacts.set(normalizedEmail, {
                email: normalizedEmail,
                type,
                name: String(name || '').trim()
            });
            return;
        }

        const existing = contacts.get(normalizedEmail);
        if (!existing.name && name) {
            existing.name = String(name).trim();
        }
        if (existing.type === 'student' && type !== 'student') {
            existing.type = type;
        }
    };

    if (this.parentInfo) {
        addContact({
            email: this.parentInfo.fatherEmail,
            type: 'father',
            name: this.parentInfo.fatherName
        });
        addContact({
            email: this.parentInfo.motherEmail,
            type: 'mother',
            name: this.parentInfo.motherName
        });
        addContact({
            email: this.parentInfo.guardianEmail,
            type: 'guardian',
            name: this.parentInfo.guardianName
        });
    }

    addContact({
        email: this.studentEmail,
        type: 'student',
        name: this.fullName
    });
    addContact({
        email: this.email,
        type: 'student',
        name: this.fullName
    });

    if (this.user && typeof this.user === 'object' && 'email' in this.user) {
        addContact({
            email: this.user.email,
            type: 'student',
            name: this.fullName
        });
    }

    return Array.from(contacts.values());
};

/**
 * Returns an array of unique, non-empty emails from father, mother, guardian,
 * student record emails, and linked user email when populated.
 * Used when sending notifications to all related contacts.
 */
studentSchema.methods.getAllContactEmails = function () {
    return this.getAllContactEmailEntries().map((entry) => entry.email);
};

// Apply tenant isolation plugin
studentSchema.plugin(tenantIsolationPlugin);

const Student = mongoose.model('Student', studentSchema);
export default Student;
