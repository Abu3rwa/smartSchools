import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const templateColumnSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        category: { type: String, required: true, trim: true, lowercase: true },
        maxMarks: { type: Number, default: 100, min: 1 },
        sortOrder: { type: Number, default: 0 }
    },
    { _id: false }
);

const templateFormulaSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        factors: [
            {
                category: { type: String, trim: true },
                weight: { type: Number, min: 0, max: 100 }
            }
        ],
        isFinalGrade: { type: Boolean, default: false }
    },
    { _id: false }
);

const gradebookTemplateSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        name: {
            type: String,
            required: [true, 'Template name is required'],
            trim: true,
            maxlength: 200
        },
        columns: {
            type: [templateColumnSchema],
            default: []
        },
        formulas: {
            type: [templateFormulaSchema],
            default: []
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        isShared: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

gradebookTemplateSchema.index({ school: 1, createdBy: 1 });

gradebookTemplateSchema.plugin(tenantIsolationPlugin);

const GradebookTemplate = mongoose.model('GradebookTemplate', gradebookTemplateSchema);

export default GradebookTemplate;
