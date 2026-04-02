import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const categoryGradeSchema = new mongoose.Schema(
    {
        category: { type: String, trim: true },
        average: { type: Number, default: 0 },
        letterGrade: { type: String, default: '' }
    },
    { _id: false }
);

const formulaGradeSchema = new mongoose.Schema(
    {
        score: { type: Number, default: 0 },
        maxMarks: { type: Number, default: 100 },
        percentage: { type: Number, default: 0 },
        letterGrade: { type: String, default: '' }
    },
    { _id: false }
);

const subjectGradeSchema = new mongoose.Schema(
    {
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject',
            required: true
        },
        subjectName: { type: String, trim: true },
        categoryGrades: [categoryGradeSchema],
        midtermGrade: { type: formulaGradeSchema, default: null },
        finalGrade: { type: formulaGradeSchema, default: null },
        overallGrade: { type: formulaGradeSchema, default: null },
        comment: { type: String, trim: true, maxlength: 2000, default: '' }
    },
    { _id: false }
);

const attendanceSummarySchema = new mongoose.Schema(
    {
        totalDays: { type: Number, default: 0 },
        presentDays: { type: Number, default: 0 },
        absentDays: { type: Number, default: 0 },
        lateDays: { type: Number, default: 0 }
    },
    { _id: false }
);

const traditionalReportCardSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student',
            required: true,
            index: true
        },
        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: true
        },
        academicYear: {
            type: String,
            required: true,
            trim: true
        },
        period: {
            type: {
                type: String,
                enum: ['semester_1', 'semester_2', 'full_year', 'midterm', 'final'],
                required: true
            },
            label: { type: String, trim: true }
        },
        reportCardId: {
            type: String,
            unique: true,
            required: true
        },
        subjects: [subjectGradeSchema],
        overallAverage: { type: Number, default: 0 },
        overallGrade: { type: String, default: '' },
        rank: { type: Number, default: null },
        totalStudents: { type: Number, default: 0 },
        attendance: { type: attendanceSummarySchema, default: null },
        principalComment: { type: String, trim: true, maxlength: 2000, default: '' },
        classTeacherComment: { type: String, trim: true, maxlength: 2000, default: '' },
        status: {
            type: String,
            enum: ['draft', 'published', 'archived'],
            default: 'draft'
        },
        template: {
            type: String,
            enum: ['classic', 'detailed', 'bilingual', 'minimal'],
            default: 'classic'
        },
        generatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        generatedAt: { type: Date, default: Date.now },
        publishedAt: { type: Date, default: null },
        pdfUrl: { type: String, default: '' },
        pdfRef: { type: String, default: '' }
    },
    { timestamps: true }
);

traditionalReportCardSchema.index({ school: 1, class: 1, academicYear: 1, 'period.type': 1 });
traditionalReportCardSchema.index({ school: 1, student: 1, academicYear: 1 });

traditionalReportCardSchema.plugin(tenantIsolationPlugin);

const TraditionalReportCard = mongoose.model('TraditionalReportCard', traditionalReportCardSchema);

export default TraditionalReportCard;
