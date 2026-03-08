import mongoose from 'mongoose';
import {
    FEATURE_KEYS,
    getDefaultPlanConfig,
    getFeaturesForPlan,
    normalizePlan
} from '../constants/features.js';
import SubscriptionPlan from './SubscriptionPlan.js';

const starterFeatureDefaults = getFeaturesForPlan('starter');
const featureSchemaDefinition = FEATURE_KEYS.reduce((acc, featureKey) => {
    acc[featureKey] = {
        type: Boolean,
        default: starterFeatureDefaults[featureKey] === true
    };
    return acc;
}, {});

const subscriptionSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        unique: true
    },
    plan: {
        type: String,
        required: true,
        default: 'starter',
        lowercase: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended', 'cancelled', 'trial'],
        required: true,
        default: 'trial'
    },
    // Payment Method
    paymentMethod: {
        type: String,
        enum: ['cash', 'stripe', 'bank_transfer'],
        default: 'cash'
    },
    // Stripe Integration (optional, for future use)
    stripeCustomerId: {
        type: String,
        required: false
    },
    stripeSubscriptionId: {
        type: String,
        required: false
    },
    stripePriceId: {
        type: String,
        required: false
    },
    // Trial Period
    trialEndsAt: {
        type: Date,
        required: false
    },
    // Billing Cycle
    currentPeriodStart: {
        type: Date,
        required: false
    },
    currentPeriodEnd: {
        type: Date,
        required: false
    },
    cancelAtPeriodEnd: {
        type: Boolean,
        default: false
    },
    // Usage Limits
    limits: {
        maxStudents: {
            type: Number,
            required: true,
            default: 50
        },
        maxTeachers: {
            type: Number,
            required: true,
            default: 10
        },
        maxClasses: {
            type: Number,
            required: true,
            default: 20
        },
        maxStorage: {
            type: Number, // in MB
            required: true,
            default: 1000
        }
    },
    // Features
    features: featureSchemaDefinition,
    // Billing Information
    billing: {
        amount: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: 'USD'
        },
        interval: {
            type: String,
            enum: ['month', 'year'],
            default: 'month'
        },
        lastBilledAt: {
            type: Date
        },
        nextBillingAt: {
            type: Date
        }
    },
    // Usage Statistics
    usage: {
        currentStudents: {
            type: Number,
            default: 0
        },
        currentTeachers: {
            type: Number,
            default: 0
        },
        currentClasses: {
            type: Number,
            default: 0
        },
        currentStorage: {
            type: Number,
            default: 0
        }
    },
    // Payment Methods
    paymentMethods: [{
        stripePaymentMethodId: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: ['card', 'bank_account'],
            required: true
        },
        brand: {
            type: String // card brand like 'visa', 'mastercard'
        },
        last4: {
            type: String
        },
        expiryMonth: {
            type: Number
        },
        expiryYear: {
            type: Number
        },
        isDefault: {
            type: Boolean,
            default: false
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    // Invoices
    invoices: [{
        stripeInvoiceId: {
            type: String,
            required: true
        },
        number: {
            type: String,
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: 'USD'
        },
        status: {
            type: String,
            enum: ['draft', 'open', 'paid', 'void', 'uncollectible'],
            required: true
        },
        dueDate: {
            type: Date
        },
        paidAt: {
            type: Date
        },
        hostedInvoiceUrl: {
            type: String
        },
        invoicePdfUrl: {
            type: String
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    // Metadata
    metadata: {
        source: {
            type: String,
            enum: ['stripe', 'manual', 'trial'],
            default: 'trial'
        },
        upgradedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        notes: {
            type: String
        }
    }
}, {
    timestamps: true
});

// Indexes (school already has unique: true in schema)
subscriptionSchema.index({ stripeCustomerId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ plan: 1 });

// Static methods to get plan configurations
subscriptionSchema.statics.getPlanConfig = async function(plan) {
    const normalizedPlan = normalizePlan(plan);
    const defaultConfig = getDefaultPlanConfig(normalizedPlan);
    const defaultFeatures = defaultConfig?.features || getFeaturesForPlan(normalizedPlan);
    const dbPlan = await SubscriptionPlan.findOne({ key: normalizedPlan })
        .select('key name description limits features billing isActive')
        .setOptions({ skipTenantFilter: true })
        .lean();

    if (dbPlan) {
        return {
            key: dbPlan.key,
            name: dbPlan.name,
            description: dbPlan.description || '',
            price: dbPlan.billing?.amount ?? 0,
            currency: dbPlan.billing?.currency || 'USD',
            interval: dbPlan.billing?.interval || 'month',
            limits: dbPlan.limits || {},
            features: {
                ...defaultFeatures,
                ...(dbPlan.features || {})
            },
            isActive: dbPlan.isActive !== false
        };
    }

    if (!defaultConfig) return null;

    return {
        key: defaultConfig.key,
        name: defaultConfig.name,
        description: defaultConfig.description || '',
        price: defaultConfig.billing.amount,
        currency: defaultConfig.billing.currency,
        interval: defaultConfig.billing.interval,
        limits: defaultConfig.limits,
        features: defaultConfig.features || getFeaturesForPlan(normalizedPlan),
        isActive: true
    };
};

// Instance method to check if user can add more students
subscriptionSchema.methods.canAddStudent = function() {
    if (this.limits.maxStudents === -1) return true; // unlimited
    return this.usage.currentStudents < this.limits.maxStudents;
};

// Instance method to check if feature is available
subscriptionSchema.methods.hasFeature = function(feature) {
    return this.features[feature] === true;
};

// Instance method to get usage percentage
subscriptionSchema.methods.getUsagePercentage = function(type) {
    if (this.limits[type] === -1) return 0; // unlimited
    return Math.round((this.usage[`current${type.charAt(0).toUpperCase() + type.slice(1)}`] / this.limits[type]) * 100);
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
