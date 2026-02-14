import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

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
        enum: ['super_admin', 'admin', 'department_principal', 'teacher', 'parent', 'student'],
        default: 'student'
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
    lastLogin: {
        type: Date
    },
    passwordResetToken: String,
    passwordResetExpires: Date,
    // Gmail OAuth tokens for sending emails
    gmailTokens: {
        email: {
            type: String,
            lowercase: true,
            trim: true
        },
        accessToken: String,
        refreshToken: String,
        expiryDate: Date,
        isActive: {
            type: Boolean,
            default: false
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

// Apply tenant isolation plugin (skip for super_admin users who don't belong to a school)
userSchema.pre(['find', 'findOne'], function() {
    if (!this.getOptions().skipTenantFilter && this.getOptions().schoolId) {
        this.where({ school: this.getOptions().schoolId });
    }
});

const User = mongoose.model('User', userSchema);
export default User;
