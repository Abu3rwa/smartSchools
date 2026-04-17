import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { decryptSecret, encryptSecret } from '../utils/secretCrypto.js';

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    role: {
        type: String,
        enum: [
            'super_admin', 
            'admin', 
            'staff',
            'teacher', 
            'parent', 
            'student',
            // Legacy roles (kept for backward compatibility)
            'department_principal',
            'attendance_manager',
            'lesson_plan_reviewer',
            'report_viewer',
            'event_coordinator',
            'behavior_manager',
            'transportation_coordinator',
            'cafeteria_manager',
            'library_manager',
            'it_support',
            'counselor',
            'nurse'
        ],
        default: 'student'
    },
    // All roles assigned to this user (multi-role support)
    roles: {
        type: [String],
        enum: [
            'super_admin', 'admin', 'staff', 'teacher', 'parent', 'student',
            'department_principal', 'attendance_manager', 'lesson_plan_reviewer',
            'report_viewer', 'event_coordinator', 'behavior_manager',
            'transportation_coordinator', 'cafeteria_manager', 'library_manager',
            'it_support', 'counselor', 'nurse'
        ],
        default: []
    },
    // Permissions array for granular access control
    permissions: {
        type: [String],
        enum: [
            'manage_attendance_reminders',
            'view_attendance_reports',
            'review_lesson_plans',
            'edit_lesson_plans',
            'view_curriculum_maps',
            'edit_curriculum_maps',
            'review_curriculum_maps',
            'publish_curriculum_maps',
            'create_curriculum_map',
            'edit_own_curriculum_map',
            'edit_any_curriculum_map',
            'review_curriculum_map',
            'approve_curriculum_map',
            'reject_curriculum_map',
            'export_curriculum_map',
            'print_curriculum_map',
            'configure_curriculum_map_templates',
            'manage_substitutions',
            'manage_events',
            'view_all_reports',
            'edit_reports',
            'sbr:manage_scales',
            'sbr:generate_reports',
            'sbr:view_reports',
            'manage_behavior',
            'view_behavior',
            'manage_transportation',
            'view_transportation',
            'manage_cafeteria',
            'view_cafeteria',
            'manage_library',
            'view_library',
            'provide_it_support',
            'access_counseling_records',
            'edit_counseling_records',
            'access_health_records',
            'edit_health_records',
            'manage_users',
            'view_grades',
            'edit_grades',
            'send_notifications',
            'manage_departments',
            'manage_school_settings',
            'send_communication_emails',
            'message_own_students',
            'message_own_student_parents',
            'message_department_students',
            'message_department_parents',
            'message_department_teachers',
            'message_department_everyone',
            'message_school_students',
            'message_school_parents',
            'message_school_teachers',
            'message_school_everyone',
            'message_assigned_subordinates',
            'delegated_communication_scope',
            'view_academic_excellence_student',
            'view_academic_excellence_class',
            'view_academic_excellence_school',
            'view_academic_excellence_department',
            'assign_academic_excellence_tasks',
            'review_academic_excellence_tasks',
            'bulk_assign_academic_excellence_tasks',
            'disable_academic_excellence_for_student',
            'disable_academic_excellence_for_class',
            'exclude_academic_excellence_lesson',
            'manage_academic_excellence_exclusions',
            'manage_academic_excellence_notifications',
            'override_academic_excellence_notifications',
            'manage_academic_excellence_settings',
            'view_academic_excellence_settings',
            'view_academic_excellence_school_analytics',
            'view_academic_excellence_class_analytics',
            'export_academic_excellence_reports',
            'view_academic_excellence_at_risk_report'
        ],
        default: []
    },
    // Optional scopes and expiration for permissions
    permissionScopes: {
        type: Map,
        of: {
            departmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
            classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
            expiresAt: Date
        },
        default: {}
    },
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        index: true
    },
    // For department_principal: the one department they manage (required when role is department_principal)
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        default: null
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
    title: {
        type: String,
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    // Multiple titles for multi-role users (e.g. "Humanities Teacher", "Department Head")
    titles: {
        type: [String],
        default: []
    },
    phone: {
        type: String,
        trim: true
    },
    avatar: {
        type: String,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    },
    mustChangePassword: {
        type: Boolean,
        default: false
    },
    lastLogin: {
        type: Date
    },
    failedLoginAttempts: {
        type: Number,
        default: 0,
        select: false
    },
    lockedUntil: {
        type: Date,
        default: null,
        select: false
    },
    passwordResetToken: String,
    passwordResetExpires: Date,
    refreshTokenHash: {
        type: String,
        select: false,
        default: null
    },
    refreshTokenExpiresAt: {
        type: Date,
        select: false,
        default: null
    },
    loginInvite: {
        sentAt: Date,
        sentBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        deliveryStatus: {
            type: String,
            enum: ['sent', 'failed'],
            default: null
        },
        deliveryError: {
            type: String,
            default: null
        },
        recipientEmail: {
            type: String,
            lowercase: true,
            trim: true
        },
        role: {
            type: String,
            enum: ['teacher', 'student', 'parent'],
            default: null
        }
    },
    // Gmail OAuth tokens for sending emails
    gmailTokens: {
        email: {
            type: String,
            lowercase: true,
            trim: true
        },
        accessToken: {
            type: String,
            get: decryptSecret,
            set: encryptSecret
        },
        refreshToken: {
            type: String,
            get: decryptSecret,
            set: encryptSecret
        },
        expiryDate: Date,
        isActive: {
            type: Boolean,
            default: false
        }
    },
    // Separate OAuth credentials for Google Drive curriculum imports
    googleDriveTokens: {
        email: {
            type: String,
            lowercase: true,
            trim: true
        },
        accessToken: {
            type: String,
            get: decryptSecret,
            set: encryptSecret
        },
        refreshToken: {
            type: String,
            get: decryptSecret,
            set: encryptSecret
        },
        expiryDate: Date,
        isActive: {
            type: Boolean,
            default: false
        }
    },
    uiPreferences: {
        headerShortcuts: {
            type: [String],
            default: []
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function () {
    return `${this.firstName} ${this.lastName}`;
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    // Keep roles array in sync with active role
    if (this.role && (!this.roles || this.roles.length === 0)) {
        this.roles = [this.role];
    } else if (this.role && this.roles && !this.roles.includes(this.role)) {
        this.roles.push(this.role);
    }

    if (!this.isModified('password')) return next();

    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Update last login
userSchema.methods.updateLastLogin = function () {
    this.lastLogin = new Date();
    return this.save({ validateBeforeSave: false });
};

// Check if Gmail is connected
userSchema.methods.hasGmailConnected = function () {
    return this.gmailTokens?.isActive && this.gmailTokens?.refreshToken;
};

// Check if Gmail token needs refresh (5 minutes before expiry)
userSchema.methods.gmailTokenNeedsRefresh = function () {
    if (!this.gmailTokens?.expiryDate) return true;
    const fiveMinutes = 5 * 60 * 1000;
    return new Date() >= new Date(this.gmailTokens.expiryDate.getTime() - fiveMinutes);
};

// Update Gmail tokens
userSchema.methods.updateGmailTokens = async function (tokens, email) {
    this.gmailTokens = {
        email: email || this.gmailTokens?.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || this.gmailTokens?.refreshToken,
        expiryDate: new Date(tokens.expiry_date),
        isActive: true
    };
    return this.save({ validateBeforeSave: false });
};

// Clear Gmail tokens
userSchema.methods.clearGmailTokens = async function () {
    this.gmailTokens = {
        email: null,
        accessToken: null,
        refreshToken: null,
        expiryDate: null,
        isActive: false
    };
    return this.save({ validateBeforeSave: false });
};

// Check if Google Drive is connected
userSchema.methods.hasGoogleDriveConnected = function () {
    return this.googleDriveTokens?.isActive && this.googleDriveTokens?.refreshToken;
};

// Check if Google Drive token needs refresh (5 minutes before expiry)
userSchema.methods.googleDriveTokenNeedsRefresh = function () {
    if (!this.googleDriveTokens?.expiryDate) return true;
    const fiveMinutes = 5 * 60 * 1000;
    return new Date() >= new Date(this.googleDriveTokens.expiryDate.getTime() - fiveMinutes);
};

// Update Google Drive tokens
userSchema.methods.updateGoogleDriveTokens = async function (tokens, email) {
    this.googleDriveTokens = {
        email: email || this.googleDriveTokens?.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || this.googleDriveTokens?.refreshToken,
        expiryDate: new Date(tokens.expiry_date),
        isActive: true
    };
    return this.save({ validateBeforeSave: false });
};

// Clear Google Drive tokens
userSchema.methods.clearGoogleDriveTokens = async function () {
    this.googleDriveTokens = {
        email: null,
        accessToken: null,
        refreshToken: null,
        expiryDate: null,
        isActive: false
    };
    return this.save({ validateBeforeSave: false });
};

// Apply tenant isolation plugin (skip for super_admin users who don't belong to a school)
userSchema.pre(['find', 'findOne'], function() {
    if (!this.getOptions().skipTenantFilter && this.getOptions().schoolId) {
        this.where({ school: this.getOptions().schoolId });
    }
});

const User = mongoose.model('User', userSchema);
export default User;

