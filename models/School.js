import mongoose from 'mongoose';
import { inferAcademicYear, isValidAcademicYear } from '../utils/academicYear.js';
import { FEATURE_KEYS, getFeaturesForPlan } from '../constants/features.js';
import {
    createDefaultCurriculumSettings,
    DEFAULT_CURRICULUM_TEMPLATE_KEY,
    normalizeCurriculumSettings
} from '../services/curriculum/curriculumTemplateDefaults.js';
import {
    DEFAULT_ATTENDANCE_REMINDER_DELAY_MINUTES,
    DEFAULT_ATTENDANCE_REMINDER_ENABLED,
    MAX_ATTENDANCE_REMINDER_DELAY_MINUTES,
    MIN_ATTENDANCE_REMINDER_DELAY_MINUTES
} from '../utils/attendanceReminderSettings.js';

const starterFeatureDefaults = getFeaturesForPlan('starter');
const schoolFeatureSchemaDefinition = FEATURE_KEYS.reduce((acc, featureKey) => {
    acc[featureKey] = {
        type: Boolean,
        default: starterFeatureDefaults[featureKey] === true
    };
    return acc;
}, {});

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
            enum: ['trial', 'active', 'inactive', 'suspended', 'past_due', 'cancelled', 'expired'],
            default: 'trial'
        },
        plan: {
            type: String,
            default: 'starter',
            lowercase: true,
            trim: true
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
        academicYearStartDate: {
            type: Date
        },
        academicYearEndDate: {
            type: Date
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
        communication: {
            aiEmailDraftEnabled: {
                type: Boolean,
                default: true
            }
        },
        curriculum: {
            enabled: {
                type: Boolean,
                default: true
            },
            ai: {
                enabled: {
                    type: Boolean,
                    default: true
                },
                allowFileImport: {
                    type: Boolean,
                    default: true
                },
                allowGoogleDocsImport: {
                    type: Boolean,
                    default: true
                },
                maxFileSizeMb: {
                    type: Number,
                    min: 1,
                    max: 50,
                    default: 10
                },
                allowedMimeTypes: [{
                    type: String,
                    trim: true
                }]
            },
            defaultAcademicYear: {
                type: String,
                default: ''
            },
            weekStartDay: {
                type: String,
                enum: ['monday', 'sunday', 'saturday'],
                default: 'monday'
            },
            approvalFlow: {
                type: String,
                enum: ['draft_review_publish', 'draft_publish'],
                default: 'draft_review_publish'
            },
            exports: {
                allowPdf: {
                    type: Boolean,
                    default: true
                },
                allowCsv: {
                    type: Boolean,
                    default: true
                },
                allowHtml: {
                    type: Boolean,
                    default: true
                }
            },
            mapStructure: {
                periodType: {
                    type: String,
                    enum: ['term', 'quarter', 'semester', 'custom'],
                    default: 'term'
                },
                granularity: {
                    type: String,
                    enum: ['term_only', 'unit', 'week', 'unit_week', 'strand_unit'],
                    default: 'unit_week'
                },
                allowCustomPeriods: {
                    type: Boolean,
                    default: true
                }
            },
            terminology: {
                period: {
                    type: String,
                    trim: true,
                    default: 'Term'
                },
                section: {
                    type: String,
                    trim: true,
                    default: 'Unit'
                },
                item: {
                    type: String,
                    trim: true,
                    default: 'Week'
                },
                standards: {
                    type: String,
                    trim: true,
                    default: 'Standards'
                },
                performanceTask: {
                    type: String,
                    trim: true,
                    default: 'Performance Task'
                }
            },
            workflow: {
                reviewEnabled: {
                    type: Boolean,
                    default: true
                },
                approvalRequired: {
                    type: Boolean,
                    default: true
                },
                allowDirectPublishWhenApprovalDisabled: {
                    type: Boolean,
                    default: true
                }
            },
            termTemplates: [{
                name: {
                    type: String,
                    trim: true
                },
                startWeek: {
                    type: Number,
                    min: 1,
                    max: 53
                },
                endWeek: {
                    type: Number,
                    min: 1,
                    max: 53
                }
            }],
            validation: {
                requireMapTitle: {
                    type: Boolean,
                    default: true
                },
                requireAtLeastOneUnit: {
                    type: Boolean,
                    default: true
                },
                maxUnitsPerMap: {
                    type: Number,
                    default: 24,
                    min: 1,
                    max: 100
                }
            },
            templates: [{
                key: {
                    type: String,
                    trim: true
                },
                name: {
                    type: String,
                    trim: true
                },
                isDefault: {
                    type: Boolean,
                    default: false
                },
                structure: {
                    periodLabel: { type: String, trim: true },
                    sectionLabel: { type: String, trim: true },
                    itemLabel: { type: String, trim: true },
                    granularity: { type: String, trim: true },
                    allowSectionDateRanges: { type: Boolean, default: true },
                    allowItemDateRanges: { type: Boolean, default: true }
                },
                labels: {
                    period: { type: String, trim: true },
                    section: { type: String, trim: true },
                    item: { type: String, trim: true },
                    standards: { type: String, trim: true },
                    skills: { type: String, trim: true },
                    learningObjectives: { type: String, trim: true },
                    performanceTask: { type: String, trim: true },
                    essentialQuestions: { type: String, trim: true },
                    activities: { type: String, trim: true },
                    notes: { type: String, trim: true }
                },
                fields: [{
                    key: { type: String, trim: true },
                    label: { type: String, trim: true },
                    type: { type: String, trim: true },
                    enabled: { type: Boolean, default: true },
                    required: { type: Boolean, default: false }
                }],
                requiredFields: [{ type: String, trim: true }],
                workflow: {
                    reviewEnabled: { type: Boolean, default: true },
                    approvalRequired: { type: Boolean, default: true },
                    autoAssignReviewers: { type: Boolean, default: true }
                },
                export: {
                    includeSchoolHeader: { type: Boolean, default: true },
                    includeStatusTimeline: { type: Boolean, default: true },
                    preferredColumns: [{ type: String, trim: true }]
                }
            }],
            activeTemplateKey: {
                type: String,
                trim: true,
                default: DEFAULT_CURRICULUM_TEMPLATE_KEY
            },
            exportPreferences: {
                preferredColumns: [{ type: String, trim: true }],
                includeReviewerNotes: { type: Boolean, default: true },
                includeAuditTrail: { type: Boolean, default: true }
            }
        },
        attendanceReminders: {
            enabled: {
                type: Boolean,
                default: DEFAULT_ATTENDANCE_REMINDER_ENABLED
            },
            delayMinutes: {
                type: Number,
                default: DEFAULT_ATTENDANCE_REMINDER_DELAY_MINUTES,
                min: MIN_ATTENDANCE_REMINDER_DELAY_MINUTES,
                max: MAX_ATTENDANCE_REMINDER_DELAY_MINUTES
            }
        },
        features: {
            ...schoolFeatureSchemaDefinition
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
    this.settings = this.settings || {};
    this.settings.curriculum = normalizeCurriculumSettings(this.settings.curriculum || createDefaultCurriculumSettings());
    if (!this.settings.curriculum.activeTemplateKey) {
        this.settings.curriculum.activeTemplateKey = this.settings.curriculum.templates[0]?.key || DEFAULT_CURRICULUM_TEMPLATE_KEY;
    }

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
