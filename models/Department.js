import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const departmentSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Department name is required'],
        trim: true
    },
    slug: {
        type: String,
        lowercase: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['academic', 'support'],
        default: 'academic'
    },
    description: {
        type: String,
        trim: true
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

departmentSchema.index({ school: 1, slug: 1 }, { unique: true });
departmentSchema.index({ school: 1, name: 1 }, { unique: true });

departmentSchema.pre('save', function (next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    next();
});

departmentSchema.plugin(tenantIsolationPlugin);

const Department = mongoose.model('Department', departmentSchema);
export default Department;
