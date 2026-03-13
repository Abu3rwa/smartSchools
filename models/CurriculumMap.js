import mongoose from 'mongoose';
import { tenantIsolationPlugin } from '../middleware/tenantIsolation.js';
import {
    CURRICULUM_ITEM_TYPES,
    CURRICULUM_MAP_STATUSES
} from '../services/curriculum/curriculumTemplateDefaults.js';

const workflowSchema = new mongoose.Schema({
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    reviewDecision: {
        type: String,
        enum: ['approved', 'rejected', 'changes_requested', null],
        default: null
    },
    reviewNote: { type: String, trim: true, default: '' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: Date,
    currentState: {
        type: String,
        enum: CURRICULUM_MAP_STATUSES,
        default: 'draft'
    }
}, { _id: false });

const mapUnitSchema = new mongoose.Schema({
    unitCode: { type: String, trim: true, default: '' },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: '' },
    standards: { type: String, trim: true, default: '' },
    skills: { type: String, trim: true, default: '' },
    studentOutcomes: { type: String, trim: true, default: '' },
    performanceTask: { type: String, trim: true, default: '' },
    startWeek: { type: Number, min: 1, max: 53, required: true },
    endWeek: { type: Number, min: 1, max: 53, required: true },
    estimatedWeeks: { type: Number, min: 1, max: 53, default: 1 },
    standardIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Standard' }],
    resources: [{ type: String, trim: true }],
    notes: { type: String, trim: true, default: '' }
}, { _id: true });

const termTemplateSchema = new mongoose.Schema({
    name: { type: String, trim: true, required: true, maxlength: 80 },
    startWeek: { type: Number, min: 1, max: 53, required: true },
    endWeek: { type: Number, min: 1, max: 53, required: true }
}, { _id: false });

const standardLinkSchema = new mongoose.Schema({
    standardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Standard', default: null },
    sourceType: {
        type: String,
        enum: ['school_defined', 'framework_import', 'custom_entry'],
        default: 'school_defined'
    },
    code: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    framework: { type: String, trim: true, default: '' }
}, { _id: true });

const customFieldValueSchema = new mongoose.Schema({
    fieldKey: { type: String, trim: true, required: true, maxlength: 120 },
    valueType: {
        type: String,
        enum: ['text', 'list', 'boolean', 'date_range'],
        default: 'text'
    },
    textValue: { type: String, trim: true, default: '' },
    listValue: [{ type: String, trim: true }],
    boolValue: { type: Boolean, default: null },
    rangeValue: {
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null }
    }
}, { _id: false });

const curriculumItemSchema = new mongoose.Schema({
    title: { type: String, trim: true, required: true, maxlength: 220 },
    type: {
        type: String,
        enum: CURRICULUM_ITEM_TYPES,
        default: 'instructional_block'
    },
    orderIndex: { type: Number, default: 0, min: 0 },
    dateRange: {
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null }
    },
    startWeek: { type: Number, min: 1, max: 53, default: null },
    endWeek: { type: Number, min: 1, max: 53, default: null },
    standards: [standardLinkSchema],
    skills: [{ type: String, trim: true }],
    learningObjectives: [{ type: String, trim: true }],
    essentialQuestions: [{ type: String, trim: true }],
    activitiesResources: [{ type: String, trim: true }],
    performanceTasks: [{ type: String, trim: true }],
    assessment: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    customFieldValues: [customFieldValueSchema]
}, { _id: true });

const curriculumSectionSchema = new mongoose.Schema({
    title: { type: String, trim: true, required: true, maxlength: 220 },
    orderIndex: { type: Number, default: 0, min: 0 },
    sectionType: { type: String, trim: true, default: 'period' },
    dateRange: {
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null }
    },
    items: [curriculumItemSchema]
}, { _id: true });

const reviewCommentSchema = new mongoose.Schema({
    scope: {
        targetType: {
            type: String,
            enum: ['map', 'section', 'item'],
            default: 'map'
        },
        sectionId: { type: mongoose.Schema.Types.ObjectId, default: null },
        itemId: { type: mongoose.Schema.Types.ObjectId, default: null },
        fieldKey: { type: String, trim: true, default: '' }
    },
    commentType: {
        type: String,
        enum: ['comment', 'revision_request', 'approval_note', 'rejection_note'],
        default: 'comment'
    },
    message: { type: String, trim: true, required: true, maxlength: 4000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
}, { _id: true });

const auditEntrySchema = new mongoose.Schema({
    action: { type: String, required: true, trim: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now },
    message: { type: String, trim: true, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const curriculumMapSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'School',
        required: true
    },
    academicYear: {
        type: String,
        required: true,
        trim: true
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    grade: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        default: null
    },
    templateKey: {
        type: String,
        trim: true,
        default: 'default-flex-template'
    },
    templateSnapshot: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    structure: {
        periodType: {
            type: String,
            enum: ['term', 'quarter', 'semester', 'custom'],
            default: 'term'
        },
        granularity: {
            type: String,
            enum: ['term_only', 'unit', 'week', 'unit_week', 'strand_unit'],
            default: 'unit_week'
        },
        sectionLabel: { type: String, trim: true, default: 'Unit' },
        itemLabel: { type: String, trim: true, default: 'Week' }
    },
    title: {
        type: String,
        trim: true,
        required: true,
        maxlength: 200
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        enum: CURRICULUM_MAP_STATUSES,
        default: 'draft',
        index: true
    },
    version: {
        type: Number,
        required: true,
        min: 1,
        default: 1
    },
    isCurrent: {
        type: Boolean,
        default: true,
        index: true
    },
    previousVersionMapId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CurriculumMap',
        default: null
    },
    sections: {
        type: [curriculumSectionSchema],
        default: []
    },
    units: [mapUnitSchema],
    planningTemplate: {
        weekStartDay: {
            type: String,
            enum: ['monday', 'sunday', 'saturday'],
            default: 'monday'
        },
        terms: [termTemplateSchema]
    },
    workflow: {
        type: workflowSchema,
        default: () => ({})
    },
    reviewComments: {
        type: [reviewCommentSchema],
        default: []
    },
    workflowHistory: {
        type: [auditEntrySchema],
        default: []
    },
    auditTrail: {
        type: [auditEntrySchema],
        default: []
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

const toPositiveWeek = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    if (number < 1 || number > 53) return null;
    return Math.round(number);
};

const listSectionItemsAsUnits = (sections = []) => {
    const units = [];
    for (const section of sections || []) {
        for (const item of section?.items || []) {
            const startWeek = toPositiveWeek(item?.startWeek);
            const endWeek = toPositiveWeek(item?.endWeek ?? item?.startWeek);
            if (!startWeek || !endWeek) continue;
            units.push({
                unitCode: '',
                title: item.title || '',
                description: '',
                standards: (item.standards || []).map((standard) => standard.code || standard.title || '').filter(Boolean).join(' | '),
                skills: (item.skills || []).join(' | '),
                studentOutcomes: (item.learningObjectives || []).join(' | '),
                performanceTask: (item.performanceTasks || []).join(' | '),
                startWeek,
                endWeek,
                estimatedWeeks: Math.max(1, endWeek - startWeek + 1),
                standardIds: (item.standards || []).map((standard) => standard.standardId).filter(Boolean),
                resources: item.activitiesResources || [],
                notes: item.notes || ''
            });
        }
    }
    return units;
};

curriculumMapSchema.pre('validate', function(next) {
    if (!Array.isArray(this.sections) || this.sections.length === 0) {
        return next();
    }

    if (!Array.isArray(this.units) || this.units.length === 0) {
        this.units = listSectionItemsAsUnits(this.sections);
    }
    next();
});

curriculumMapSchema.index(
    { school: 1, academicYear: 1, classId: 1, subject: 1, isCurrent: 1 },
    { unique: true, partialFilterExpression: { isCurrent: true } }
);
curriculumMapSchema.index({ school: 1, academicYear: 1, status: 1 });
curriculumMapSchema.index({ school: 1, classId: 1, subject: 1 });
curriculumMapSchema.index({ school: 1, createdBy: 1, status: 1, updatedAt: -1 });

curriculumMapSchema.plugin(tenantIsolationPlugin);

const CurriculumMap = mongoose.model('CurriculumMap', curriculumMapSchema);
export default CurriculumMap;
