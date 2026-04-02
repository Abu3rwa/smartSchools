import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const examPeriodSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['midterm', 'final'],
            required: true
        },
        label: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        labelAr: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ''
        },
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        },
        weight: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        }
    },
    { _id: false }
);

const semesterSchema = new mongoose.Schema(
    {
        number: {
            type: Number,
            required: true,
            enum: [1, 2]
        },
        label: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        labelAr: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ''
        },
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        },
        examPeriods: {
            type: [examPeriodSchema],
            default: []
        },
        courseworkWeight: {
            type: Number,
            min: 0,
            max: 100,
            default: 100
        }
    },
    { _id: false }
);

const categorySchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        label: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        labelAr: {
            type: String,
            trim: true,
            maxlength: 120,
            default: ''
        },
        color: {
            type: String,
            trim: true,
            default: '#64748b'
        },
        isExam: {
            type: Boolean,
            default: false
        },
        icon: {
            type: String,
            trim: true,
            default: ''
        },
        sortOrder: {
            type: Number,
            default: 0
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { _id: false }
);

const gradingPolicySchema = new mongoose.Schema(
    {
        passingPercentage: {
            type: Number,
            min: 0,
            max: 100,
            default: 50
        },
        allowExtraCredit: {
            type: Boolean,
            default: true
        },
        roundingMode: {
            type: String,
            enum: ['round', 'floor', 'ceil'],
            default: 'round'
        },
        decimalPlaces: {
            type: Number,
            min: 0,
            max: 4,
            default: 2
        },
        showLetterGrades: {
            type: Boolean,
            default: true
        },
        showPercentages: {
            type: Boolean,
            default: true
        }
    },
    { _id: false }
);

const DEFAULT_CATEGORIES = [
    { key: 'classwork', label: 'Classwork', labelAr: 'عمل صفي', color: '#3b82f6', isExam: false, sortOrder: 1, isActive: true },
    { key: 'homework', label: 'Homework', labelAr: 'واجب منزلي', color: '#10b981', isExam: false, sortOrder: 2, isActive: true },
    { key: 'quiz', label: 'Quiz', labelAr: 'اختبار قصير', color: '#f59e0b', isExam: false, sortOrder: 3, isActive: true },
    { key: 'test', label: 'Test', labelAr: 'اختبار', color: '#ef4444', isExam: false, sortOrder: 4, isActive: true },
    { key: 'project', label: 'Project', labelAr: 'مشروع', color: '#8b5cf6', isExam: false, sortOrder: 5, isActive: true },
    { key: 'participation', label: 'Participation', labelAr: 'مشاركة', color: '#06b6d4', isExam: false, sortOrder: 6, isActive: true },
    { key: 'oral', label: 'Oral', labelAr: 'شفهي', color: '#ec4899', isExam: false, sortOrder: 7, isActive: true },
    { key: 'practical', label: 'Practical', labelAr: 'عملي', color: '#14b8a6', isExam: false, sortOrder: 8, isActive: true },
    { key: 'midterm_exam', label: 'Midterm Exam', labelAr: 'اختبار نصف الفصل', color: '#dc2626', isExam: true, sortOrder: 9, isActive: true },
    { key: 'final_exam', label: 'Final Exam', labelAr: 'اختبار نهائي', color: '#991b1b', isExam: true, sortOrder: 10, isActive: true }
];

const gradebookConfigSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        academicYear: {
            type: String,
            required: [true, 'Academic year is required'],
            trim: true
        },
        semesters: {
            type: [semesterSchema],
            default: []
        },
        categories: {
            type: [categorySchema],
            default: () => [...DEFAULT_CATEGORIES]
        },
        gradingPolicy: {
            type: gradingPolicySchema,
            default: () => ({})
        },
        isActive: {
            type: Boolean,
            default: true
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    { timestamps: true }
);

gradebookConfigSchema.index({ school: 1, academicYear: 1 }, { unique: true });
gradebookConfigSchema.index({ school: 1, isActive: 1 });

gradebookConfigSchema.plugin(tenantIsolationPlugin);

/**
 * Find the semester number for a given date based on the configured semester date ranges.
 * Returns null if no matching semester is found.
 */
gradebookConfigSchema.methods.getSemesterForDate = function (date) {
    const d = new Date(date);
    for (const semester of this.semesters) {
        if (d >= semester.startDate && d <= semester.endDate) {
            return semester.number;
        }
    }
    return null;
};

/**
 * Find the exam period type for a given date.
 * Returns 'midterm', 'final', or null.
 */
gradebookConfigSchema.methods.getExamPeriodForDate = function (date) {
    const d = new Date(date);
    for (const semester of this.semesters) {
        for (const examPeriod of semester.examPeriods) {
            if (d >= examPeriod.startDate && d <= examPeriod.endDate) {
                return examPeriod.type;
            }
        }
    }
    return null;
};

export { DEFAULT_CATEGORIES };

const GradebookConfig = mongoose.model('GradebookConfig', gradebookConfigSchema);
export default GradebookConfig;
