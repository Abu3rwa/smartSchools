import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';

const exportColumnSchema = new mongoose.Schema(
    {
        // App category key (classwork, homework, quiz, test, project, …)
        sourceType: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        enabled: {
            type: Boolean,
            default: true
        },
        // Name written to the file; supports {MMM}, {MMMM}, {YYYY} tokens
        columnName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        // Category name as QuickSchools spells it (e.g. Activities, Assignment)
        category: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        totalMarks: {
            type: Number,
            required: true,
            min: 1,
            max: 1000
        },
        dateRule: {
            type: String,
            enum: ['fixed', 'latest'],
            default: 'fixed'
        },
        fixedDate: {
            type: Date,
            default: null
        }
    },
    { _id: false }
);

const exportProfileSchema = new mongoose.Schema(
    {
        school: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'School',
            required: true,
            index: true
        },
        name: {
            type: String,
            required: [true, 'Profile name is required'],
            trim: true,
            maxlength: 120
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
            required: [true, 'Academic year is required'],
            trim: true
        },
        // Which grades feed the export (1 or 2); null exports the whole year
        semester: {
            type: Number,
            enum: [1, 2, null],
            default: null
        },
        // Values written to the file — what QuickSchools expects to read back
        subjectValue: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        gradeLevel: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120
        },
        semesterName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        columns: {
            type: [exportColumnSchema],
            default: []
        },
        nameSource: {
            type: String,
            enum: ['externalName', 'fullName'],
            default: 'externalName'
        },
        skipEmpty: {
            type: Boolean,
            default: true
        },
        roundTo: {
            type: Number,
            min: 0,
            max: 4,
            default: 2
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    { timestamps: true }
);

exportProfileSchema.index({ school: 1, class: 1, subject: 1, academicYear: 1 });

exportProfileSchema.plugin(tenantIsolationPlugin);

const ExportProfile = mongoose.model('ExportProfile', exportProfileSchema);
export default ExportProfile;
