import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const assignmentTypeSchema = new mongoose.Schema(
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
            maxlength: 80
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
        sortOrder: {
            type: Number,
            default: 0
        },
        defaults: {
            maxMarks: {
                type: Number,
                default: 10,
                min: 1
            },
            allowLateSubmission: {
                type: Boolean,
                default: false
            },
            notifyOnAssign: {
                type: Boolean,
                default: true
            },
            notifyOnGrade: {
                type: Boolean,
                default: true
            }
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    {
        timestamps: true
    }
);

assignmentTypeSchema.index({ school: 1, key: 1 }, { unique: true });
assignmentTypeSchema.index({ school: 1, isActive: 1, sortOrder: 1, name: 1 });

assignmentTypeSchema.plugin(tenantIsolationPlugin);

// BE-028: Propagate name/key changes to denormalized fields in Grade documents
assignmentTypeSchema.post('findOneAndUpdate', async function (doc) {
    if (!doc) return;
    try {
        const Grade = mongoose.model('Grade');
        await Grade.updateMany(
            { school: doc.school, assignmentTypeKey: doc.key },
            { $set: { assignmentTypeName: doc.name } }
        ).setOptions({ skipTenantFilter: true });
    } catch {
        // Non-critical — grades will show old name until next save
    }
});

const AssignmentType = mongoose.model('AssignmentType', assignmentTypeSchema);

export default AssignmentType;
