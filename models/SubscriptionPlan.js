import mongoose from 'mongoose';
import {
    FEATURE_KEYS,
    getDefaultPlanConfig,
    getFeaturesForPlan
} from '../constants/features.js';

const starterDefaults = getDefaultPlanConfig('starter');
const featureSchemaDefinition = FEATURE_KEYS.reduce((acc, featureKey) => {
    acc[featureKey] = {
        type: Boolean,
        default: starterDefaults?.features?.[featureKey] === true
    };
    return acc;
}, {});

const subscriptionPlanSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    limits: {
        maxStudents: {
            type: Number,
            required: true,
            default: starterDefaults?.limits?.maxStudents ?? 50
        },
        maxTeachers: {
            type: Number,
            required: true,
            default: starterDefaults?.limits?.maxTeachers ?? 10
        },
        maxClasses: {
            type: Number,
            required: true,
            default: starterDefaults?.limits?.maxClasses ?? 20
        },
        maxStorage: {
            type: Number,
            required: true,
            default: starterDefaults?.limits?.maxStorage ?? 1000
        }
    },
    features: featureSchemaDefinition,
    billing: {
        amount: {
            type: Number,
            required: true,
            default: starterDefaults?.billing?.amount ?? 29
        },
        currency: {
            type: String,
            default: starterDefaults?.billing?.currency ?? 'USD'
        },
        interval: {
            type: String,
            enum: ['month', 'year'],
            default: starterDefaults?.billing?.interval ?? 'month'
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    sortOrder: {
        type: Number,
        default: 0
    },
    metadata: {
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        source: {
            type: String,
            enum: ['system_default', 'manual'],
            default: 'manual'
        }
    }
}, {
    timestamps: true
});

subscriptionPlanSchema.index({ key: 1 }, { unique: true });
subscriptionPlanSchema.index({ isActive: 1, sortOrder: 1, createdAt: 1 });

subscriptionPlanSchema.statics.getSeedPayloadForDefaultPlan = function(planKey) {
    const defaults = getDefaultPlanConfig(planKey);
    if (!defaults) return null;

    return {
        key: defaults.key,
        name: defaults.name,
        description: defaults.description || '',
        limits: defaults.limits,
        features: defaults.features || getFeaturesForPlan(planKey),
        billing: defaults.billing,
        isActive: true,
        sortOrder: ['starter', 'professional', 'enterprise'].indexOf(defaults.key),
        metadata: {
            source: 'system_default'
        }
    };
};

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

export default SubscriptionPlan;
