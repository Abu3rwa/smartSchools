import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const sbrScaleLevelSchema = new mongoose.Schema(
    {
        value: {
            type: Number,
            required: true
        },
        label: {
            type: String,
            required: true,
            trim: true
        },
        labelAr: {
            type: String,
            trim: true,
            default: ''
        },
        description: {
            type: String,
            trim: true,
            default: ''
        },
        minPercent: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        maxPercent: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        color: {
            type: String,
            trim: true,
            default: ''
        }
    },
    { _id: false }
);

const sbrScaleSpecialCodeSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true
        },
        label: {
            type: String,
            required: true,
            trim: true
        },
        labelAr: {
            type: String,
            trim: true,
            default: ''
        }
    },
    { _id: false }
);

const sbrScaleSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
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
        isDefault: {
            type: Boolean,
            default: false
        },
        isActive: {
            type: Boolean,
            default: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        levels: {
            type: [sbrScaleLevelSchema],
            default: []
        },
        specialCodes: {
            type: [sbrScaleSpecialCodeSchema],
            default: []
        }
    },
    { timestamps: true }
);

sbrScaleSchema.index(
    { school: 1, isDefault: 1 },
    { unique: true, partialFilterExpression: { isDefault: true } }
);
sbrScaleSchema.index({ school: 1, isActive: 1, name: 1 });

sbrScaleSchema.plugin(tenantIsolationPlugin);

const SBRScale = mongoose.model('SBRScale', sbrScaleSchema);

export default SBRScale;
