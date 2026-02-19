import mongoose from 'mongoose';
import { inferAcademicYear, isValidAcademicYear } from '../utils/academicYear.js';

const schoolSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'School name is required'],
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true,
        trim: true
    },
    subscription: {
        status: {
            type: String,
            enum: ['trial', 'active', 'past_due', 'cancelled', 'expired'],
            default: 'trial'
        },
        plan: {
            type: String,
            enum: ['starter', 'growth', 'enterprise'],
            default: 'starter'
        },
        stripeCustomerId: String,
        stripeSubscriptionId: String,
        trialEndsAt: Date,
        currentPeriodEnd: Date,
        cancelAtPeriodEnd: {
            type: Boolean,
            default: false
        }
    },
    settings: {
        currentAcademicYear: {
            type: String,
            default: () => inferAcademicYear(),
            validate: {
                validator: (value) => isValidAcademicYear(value),
                message: 'Academic year must be in YYYY-YYYY format (consecutive years)'
            }
        },
        academicYearStartMonth: {
            type: Number,
            min: 1,
            max: 12,
            default: 8
        },
        maxStudents: {
            type: Number,
            default: 50
        },
        branding: {
            logoUrl: String,
            primaryColor: {
                type: String,
                default: '#3b82f6'
            },
            secondaryColor: {
                type: String,
                default: '#1e40af'
            }
        },
        features: {
            parentPortal: {
                type: Boolean,
                default: false
            },
            advancedAnalytics: {
                type: Boolean,
                default: false
            },
            customReports: {
                type: Boolean,
                default: false
            },
            emailNotifications: {
                type: Boolean,
                default: false
            }
        }
    },
    // AI Report settings
    reportSettings: {
        defaultLanguage: {
            type: String,
            enum: ['english', 'arabic', 'bilingual'],
            default: 'english'
        },
        allowedReportTypes: {
            type: [String],
            enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'],
            default: ['weekly', 'monthly', 'quarterly', 'yearly']
        },
        emailTemplates: {
            english: String,
            arabic: String,
            bilingual: String
        },
        tokenLimits: {
            monthlyPerTeacher: { type: Number, default: 10000 },
            yearlyPerSchool: { type: Number, default: 100000 },
            warningThreshold: { type: Number, default: 0.8 }
        }
    },
    contact: {
        adminName: {
            type: String,
            required: true
        },
        adminEmail: {
            type: String,
            required: true,
            lowercase: true
        },
        phone: String,
        address: {
            street: String,
            city: String,
            state: String,
            zipCode: String,
            country: {
                type: String,
                default: 'South Africa'
            }
        }
    },
    usageStats: {
        currentStudentCount: {
            type: Number,
            default: 0
        },
        lastBilledAmount: Number,
        lastInvoiceDate: Date
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

// Indexes for performance
schoolSchema.index({ 'subscription.status': 1 });
schoolSchema.index({ createdAt: -1 });

// Auto-generate slug from school name
schoolSchema.pre('save', function(next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    next();
});

// Virtual for checking if trial is active
schoolSchema.virtual('isTrialActive').get(function() {
    return this.subscription.status === 'trial' && 
           this.subscription.trialEndsAt > new Date();
});

// Virtual for checking if subscription is active
schoolSchema.virtual('isActiveSubscription').get(function() {
    return this.subscription.status === 'active' || this.isTrialActive;
});

const School = mongoose.model('School', schoolSchema);
export default School;
