import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const sbrReportStandardSchema = new mongoose.Schema(
    {
        standard: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Standard',
            default: null
        },
        standardCode: {
            type: String,
            trim: true,
            default: ''
        },
        standardName: {
            type: String,
            required: true,
            trim: true
        },
        score: {
            type: Number,
            default: null
        },
        rawPercentage: {
            type: Number,
            default: null
        },
        assessmentCount: {
            type: Number,
            default: 0,
            min: 0
        },
        isNA: {
            type: Boolean,
            default: false
        }
    },
    { _id: false }
);

const sbrReportCategorySchema = new mongoose.Schema(
    {
        categoryName: {
            type: String,
            required: true,
            trim: true
        },
        categoryNameAr: {
            type: String,
            trim: true,
            default: ''
        },
        sortOrder: {
            type: Number,
            default: 0
        },
        standards: {
            type: [sbrReportStandardSchema],
            default: [],
            validate: { validator: (arr) => arr.length <= 200, message: 'Exceeds max 200 standards per category' }
        }
    },
    { _id: false }
);

const sbrReportSubjectSchema = new mongoose.Schema(
    {
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject',
            default: null
        },
        subjectName: {
            type: String,
            required: true,
            trim: true
        },
        overallScore: {
            type: Number,
            default: null
        },
        categories: {
            type: [sbrReportCategorySchema],
            default: [],
            validate: { validator: (arr) => arr.length <= 50, message: 'Exceeds max 50 categories per subject' }
        }
    },
    { _id: false }
);

const sbrReportCardSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true
        },
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student',
            required: true
        },
        class: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
            required: true
        },
        academicYear: {
            type: String,
            required: true
        },
        period: {
            type: {
                type: String,
                enum: ['semester_1', 'semester_2', 'full_year'],
                required: true
            },
            label: {
                type: String,
                trim: true,
                default: ''
            }
        },
        reportCardId: {
            type: String,
            required: true,
            unique: true
        },
        scale: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SBRScale',
            required: true
        },
        subjects: {
            type: [sbrReportSubjectSchema],
            default: [],
            validate: { validator: (arr) => arr.length <= 30, message: 'Exceeds max 30 subjects per report card' }
        },
        generatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        generatedAt: {
            type: Date,
            default: Date.now
        },
        pdfUrl: {
            type: String,
            trim: true,
            default: ''
        },
        pdfRef: {
            type: String,
            trim: true,
            default: ''
        },
        status: {
            type: String,
            enum: ['draft', 'published', 'archived'],
            default: 'draft'
        },
        emailedAt: {
            type: Date,
            default: null
        },
        emailedTo: {
            type: [String],
            default: []
        },
        comments: {
            type: String,
            trim: true,
            default: ''
        },
        teacherNotes: {
            type: Map,
            of: String,
            default: {}
        }
    },
    { timestamps: true }
);

sbrReportCardSchema.index({ school: 1, student: 1, class: 1, 'period.type': 1, academicYear: 1 });
sbrReportCardSchema.index({ school: 1, class: 1, 'period.type': 1, academicYear: 1 });
// unique: true on the reportCardId field definition above already creates this index

sbrReportCardSchema.plugin(tenantIsolationPlugin);

const SBRReportCard = mongoose.model('SBRReportCard', sbrReportCardSchema);

export default SBRReportCard;
