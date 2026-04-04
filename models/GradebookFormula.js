import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const formulaFactorSchema = new mongoose.Schema(
    {
        category: {
            type: String,
            trim: true,
            default: ''
        },
        weight: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        columnIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'GradebookColumn'
            }
        ],
        formulaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'GradebookFormula',
            default: null
        }
    },
    { _id: false }
);

const gradebookFormulaSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: true
        },
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject',
            required: true
        },
        academicYear: {
            type: String,
            required: true,
            trim: true
        },
        semester: {
            type: Number,
            enum: [1, 2, null],
            default: null
        },
        name: {
            type: String,
            required: [true, 'Formula name is required'],
            trim: true,
            maxlength: 200
        },
        totalMarks: {
            type: Number,
            default: 100,
            min: 1
        },
        isFinalGrade: {
            type: Boolean,
            default: false
        },
        factors: {
            type: [formulaFactorSchema],
            validate: {
                validator(factors) {
                    const total = factors.reduce((sum, f) => sum + (f.weight || 0), 0);
                    return Math.abs(total - 100) < 0.01;
                },
                message: 'Factor weights must sum to 100'
            }
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    { timestamps: true }
);

gradebookFormulaSchema.index({ school: 1, class: 1, subject: 1, academicYear: 1 });
// Only one final grade formula per class+subject+semester
gradebookFormulaSchema.index(
    { school: 1, class: 1, subject: 1, academicYear: 1, semester: 1, isFinalGrade: 1 },
    { unique: true, partialFilterExpression: { isFinalGrade: true } }
);

gradebookFormulaSchema.plugin(tenantIsolationPlugin);

// BE-029: Prevent circular formula references and unbounded nesting
gradebookFormulaSchema.pre('save', async function (next) {
    const nestedFormulaIds = this.factors
        .filter(f => f.formulaId)
        .map(f => f.formulaId.toString());

    if (nestedFormulaIds.length === 0) return next();

    // Self-reference check
    const selfId = this._id?.toString();
    if (selfId && nestedFormulaIds.includes(selfId)) {
        return next(new Error('A formula cannot reference itself'));
    }

    // Depth check: walk one level of nested formulas to ensure max depth = 2
    const GradebookFormula = mongoose.model('GradebookFormula');
    const children = await GradebookFormula.find({
        _id: { $in: nestedFormulaIds }
    }).select('factors').lean();

    for (const child of children) {
        const hasGrandchildren = (child.factors || []).some(f => f.formulaId);
        if (hasGrandchildren) {
            return next(new Error('Formula nesting depth cannot exceed 2 levels'));
        }
        // Check if child references us (circular)
        if (selfId && (child.factors || []).some(f => f.formulaId?.toString() === selfId)) {
            return next(new Error('Circular formula reference detected'));
        }
    }

    next();
});

const GradebookFormula = mongoose.model('GradebookFormula', gradebookFormulaSchema);

export default GradebookFormula;
