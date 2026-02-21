import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const parentSettingSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true,
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    language: {
        type: String,
        trim: true,
        lowercase: true,
        default: 'en'
    },
    notifications: {
        push: {
            type: Boolean,
            default: true
        },
        email: {
            type: Boolean,
            default: true
        },
        attendance: {
            type: Boolean,
            default: true
        },
        grades: {
            type: Boolean,
            default: true
        },
        reports: {
            type: Boolean,
            default: true
        }
    }
}, {
    timestamps: true
});

parentSettingSchema.index({ school: 1, user: 1 }, { unique: true });
parentSettingSchema.plugin(tenantIsolationPlugin);

const ParentSetting = mongoose.model('ParentSetting', parentSettingSchema);
export default ParentSetting;
