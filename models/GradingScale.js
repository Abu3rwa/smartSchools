import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const gradingBandSchema = new mongoose.Schema(
    {
        grade: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
            maxlength: 8
        },
        min: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        max: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        color: {
            type: String,
            required: true,
            trim: true,
            default: '#64748b'
        }
    },
    { _id: false }
);

const specialCodeRuleSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
            maxlength: 12
        },
        label: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        countsAsZero: {
            type: Boolean,
            default: false
        },
        excludeFromAverage: {
            type: Boolean,
            default: true
        }
    },
    { _id: false }
);

const gradingScaleSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        key: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ''
        },
        isSystem: {
            type: Boolean,
            default: false
        },
        isActive: {
            type: Boolean,
            default: true
        },
        isDefault: {
            type: Boolean,
            default: false
        },
        sortOrder: {
            type: Number,
            default: 100
        },
        bands: {
            type: [gradingBandSchema],
            default: []
        },
        specialCodes: {
            type: [specialCodeRuleSchema],
            default: []
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    { timestamps: true }
);

gradingScaleSchema.index({ school: 1, key: 1 }, { unique: true });
gradingScaleSchema.index(
    { school: 1, isDefault: 1 },
    { unique: true, partialFilterExpression: { isDefault: true } }
);
gradingScaleSchema.index({ school: 1, isActive: 1, sortOrder: 1, name: 1 });

gradingScaleSchema.plugin(tenantIsolationPlugin);

const GradingScale = mongoose.model('GradingScale', gradingScaleSchema);

export default GradingScale;
