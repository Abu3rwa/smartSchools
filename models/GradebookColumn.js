import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const gradebookColumnSchema = new mongoose.Schema(
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
            required: [true, 'Class is required'],
            index: true
        },
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject',
            required: [true, 'Subject is required']
        },
        academicYear: {
            type: String,
            required: [true, 'Academic year is required'],
            trim: true
        },
        semester: {
            type: Number,
            enum: [1, 2],
            required: true
        },

        // ── Column identity ──
        name: {
            type: String,
            required: [true, 'Column name is required'],
            trim: true,
            maxlength: 200
        },
        category: {
            type: String,
            required: [true, 'Category is required'],
            trim: true,
            lowercase: true
        },
        date: {
            type: Date,
            required: true,
            default: Date.now
        },
        maxMarks: {
            type: Number,
            required: true,
            min: 1,
            default: 100
        },

        // ── Exam linking ──
        examPeriod: {
            type: String,
            enum: ['midterm', 'final', null],
            default: null
        },

        // ── Display ──
        sortOrder: {
            type: Number,
            default: 0
        },
        isVisible: {
            type: Boolean,
            default: true
        },
        isLocked: {
            type: Boolean,
            default: false
        },

        // ── Formula reference ──
        isFormula: {
            type: Boolean,
            default: false
        },
        formulaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'GradebookFormula',
            default: null
        },
        isFinalGrade: {
            type: Boolean,
            default: false
        },

        // ── Lesson plan link ──
        lessonPlanIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'LessonPlan'
            }
        ],

        // ── Legacy migration ──
        assessmentGroupId: {
            type: String,
            trim: true,
            default: ''
        },

        // ── Metadata ──
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        template: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'GradebookTemplate',
            default: null
        }
    },
    { timestamps: true }
);

// Core lookup: all columns for a class+subject+semester
gradebookColumnSchema.index(
    { school: 1, class: 1, subject: 1, academicYear: 1, semester: 1, sortOrder: 1 }
);

// For legacy migration lookup
gradebookColumnSchema.index(
    { school: 1, assessmentGroupId: 1 },
    { sparse: true }
);

// For checking duplicates during migration
gradebookColumnSchema.index(
    { school: 1, class: 1, subject: 1, academicYear: 1, assessmentGroupId: 1 },
    { unique: true, partialFilterExpression: { assessmentGroupId: { $ne: '' } } }
);

gradebookColumnSchema.plugin(tenantIsolationPlugin);

const GradebookColumn = mongoose.model('GradebookColumn', gradebookColumnSchema);

export default GradebookColumn;
