import { z } from 'zod';
import {
    CURRICULUM_FIELD_TYPES,
    CURRICULUM_ITEM_TYPES,
    CURRICULUM_MAP_STATUSES,
    CURRICULUM_REVIEW_DECISIONS
} from '../services/curriculum/curriculumTemplateDefaults.js';

const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN, 'Invalid id');
const stringOrNull = z.string().trim().optional().nullable();

const weekNumberSchema = z.coerce.number().int().min(1).max(53);

const statusSchema = z.enum(CURRICULUM_MAP_STATUSES);
const reviewDecisionSchema = z.enum(CURRICULUM_REVIEW_DECISIONS);

const dateRangeSchema = z.object({
    startDate: z.coerce.date().optional().nullable(),
    endDate: z.coerce.date().optional().nullable()
});

const mapUnitSchema = z.object({
    unitCode: z.string().trim().max(80).optional(),
    title: z.string().trim().min(1, 'Unit title is required').max(200),
    description: z.string().trim().max(2000).optional(),
    standards: z.string().trim().max(4000).optional(),
    skills: z.string().trim().max(4000).optional(),
    studentOutcomes: z.string().trim().max(4000).optional(),
    performanceTask: z.string().trim().max(4000).optional(),
    startWeek: weekNumberSchema,
    endWeek: weekNumberSchema,
    estimatedWeeks: z.coerce.number().int().min(1).max(53).optional(),
    standardIds: z.array(objectIdSchema).optional(),
    resources: z.array(z.string().trim().max(300)).optional(),
    notes: z.string().trim().max(2000).optional()
});

const standardLinkSchema = z.object({
    standardId: objectIdSchema.optional().nullable(),
    sourceType: z.enum(['school_defined', 'framework_import', 'custom_entry']).optional(),
    code: z.string().trim().max(120).optional(),
    title: z.string().trim().max(300).optional(),
    description: z.string().trim().max(2000).optional(),
    framework: z.string().trim().max(200).optional()
});

const customFieldValueSchema = z.object({
    fieldKey: z.string().trim().min(1).max(120),
    valueType: z.enum(['text', 'list', 'boolean', 'date_range']).optional(),
    textValue: z.string().trim().max(4000).optional(),
    listValue: z.array(z.string().trim().max(400)).max(100).optional(),
    boolValue: z.boolean().optional().nullable(),
    rangeValue: dateRangeSchema.optional()
});

const curriculumItemSchema = z.object({
    _id: z.string().optional(),
    title: z.string().trim().min(1).max(220),
    type: z.enum(CURRICULUM_ITEM_TYPES).optional(),
    orderIndex: z.coerce.number().int().min(0).optional(),
    dateRange: dateRangeSchema.optional(),
    startWeek: weekNumberSchema.optional().nullable(),
    endWeek: weekNumberSchema.optional().nullable(),
    standards: z.array(standardLinkSchema).max(200).optional(),
    skills: z.array(z.string().trim().max(400)).max(100).optional(),
    learningObjectives: z.array(z.string().trim().max(500)).max(200).optional(),
    essentialQuestions: z.array(z.string().trim().max(500)).max(100).optional(),
    activitiesResources: z.array(z.string().trim().max(1000)).max(200).optional(),
    performanceTasks: z.array(z.string().trim().max(1000)).max(100).optional(),
    assessment: z.string().trim().max(4000).optional(),
    notes: z.string().trim().max(4000).optional(),
    customFieldValues: z.array(customFieldValueSchema).max(150).optional()
});

const curriculumSectionSchema = z.object({
    _id: z.string().optional(),
    title: z.string().trim().min(1).max(220),
    orderIndex: z.coerce.number().int().min(0).optional(),
    sectionType: z.string().trim().max(60).optional(),
    dateRange: dateRangeSchema.optional(),
    items: z.array(curriculumItemSchema).max(240).default([])
});

const termTemplateSchema = z.object({
    name: z.string().trim().min(1).max(80),
    startWeek: weekNumberSchema,
    endWeek: weekNumberSchema
});

const templateFieldConfigSchema = z.object({
    key: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(120),
    type: z.enum(CURRICULUM_FIELD_TYPES),
    enabled: z.boolean().optional(),
    required: z.boolean().optional()
});

const templateSchema = z.object({
    key: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(200),
    isDefault: z.boolean().optional(),
    structure: z.object({
        periodLabel: z.string().trim().max(80).optional(),
        sectionLabel: z.string().trim().max(80).optional(),
        itemLabel: z.string().trim().max(80).optional(),
        granularity: z.enum(['term_only', 'unit', 'week', 'unit_week', 'strand_unit']).optional(),
        allowSectionDateRanges: z.boolean().optional(),
        allowItemDateRanges: z.boolean().optional()
    }).optional(),
    labels: z.object({
        period: z.string().trim().max(80).optional(),
        section: z.string().trim().max(80).optional(),
        item: z.string().trim().max(80).optional(),
        standards: z.string().trim().max(80).optional(),
        skills: z.string().trim().max(80).optional(),
        learningObjectives: z.string().trim().max(120).optional(),
        performanceTask: z.string().trim().max(120).optional(),
        essentialQuestions: z.string().trim().max(120).optional(),
        activities: z.string().trim().max(120).optional(),
        notes: z.string().trim().max(80).optional()
    }).optional(),
    fields: z.array(templateFieldConfigSchema).max(60).optional(),
    requiredFields: z.array(z.string().trim().max(120)).max(60).optional(),
    workflow: z.object({
        reviewEnabled: z.boolean().optional(),
        approvalRequired: z.boolean().optional(),
        autoAssignReviewers: z.boolean().optional()
    }).optional(),
    export: z.object({
        includeSchoolHeader: z.boolean().optional(),
        includeStatusTimeline: z.boolean().optional(),
        preferredColumns: z.array(z.string().trim().max(120)).max(60).optional()
    }).optional()
});

const reviewCommentScopeSchema = z.object({
    targetType: z.enum(['map', 'section', 'item']).default('map'),
    sectionId: stringOrNull,
    itemId: stringOrNull,
    fieldKey: z.string().trim().max(120).optional()
});

const reviewCommentInputSchema = z.object({
    scope: reviewCommentScopeSchema.optional(),
    commentType: z.enum(['comment', 'revision_request', 'approval_note', 'rejection_note']).optional(),
    message: z.string().trim().min(1).max(4000)
});

export const curriculumMapListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    academicYear: z.string().trim().regex(/^\d{4}-\d{4}$/, 'Invalid academicYear').optional(),
    classId: objectIdSchema.optional(),
    subjectId: objectIdSchema.optional(),
    teacherId: objectIdSchema.optional(),
    status: statusSchema.optional(),
    templateKey: z.string().trim().max(120).optional(),
    search: z.string().trim().max(200).optional()
}).passthrough();

export const curriculumMapCreateBodySchema = z.object({
    academicYear: z.string().trim().regex(/^\d{4}-\d{4}$/, 'Invalid academicYear'),
    classId: objectIdSchema,
    subjectId: objectIdSchema,
    departmentId: objectIdSchema.optional().nullable(),
    templateKey: z.string().trim().max(120).optional(),
    structure: z.object({
        periodType: z.enum(['term', 'quarter', 'semester', 'custom']).optional(),
        granularity: z.enum(['term_only', 'unit', 'week', 'unit_week', 'strand_unit']).optional(),
        sectionLabel: z.string().trim().max(80).optional(),
        itemLabel: z.string().trim().max(80).optional()
    }).optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    sections: z.array(curriculumSectionSchema).max(80).optional(),
    units: z.array(mapUnitSchema).max(200).default([]),
    planningTemplate: z.object({
        weekStartDay: z.enum(['monday', 'sunday', 'saturday']).optional(),
        terms: z.array(termTemplateSchema).max(12).optional()
    }).optional()
}).passthrough();

export const curriculumMapUpdateBodySchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    templateKey: z.string().trim().max(120).optional(),
    structure: z.object({
        periodType: z.enum(['term', 'quarter', 'semester', 'custom']).optional(),
        granularity: z.enum(['term_only', 'unit', 'week', 'unit_week', 'strand_unit']).optional(),
        sectionLabel: z.string().trim().max(80).optional(),
        itemLabel: z.string().trim().max(80).optional()
    }).optional(),
    sections: z.array(curriculumSectionSchema).max(80).optional(),
    units: z.array(mapUnitSchema).max(200).optional(),
    planningTemplate: z.object({
        weekStartDay: z.enum(['monday', 'sunday', 'saturday']).optional(),
        terms: z.array(termTemplateSchema).max(12).optional()
    }).optional(),
    expectedUpdatedAt: z.coerce.date().optional()
}).passthrough();

export const curriculumMapReviewBodySchema = z.object({
    decision: reviewDecisionSchema,
    note: z.string().trim().max(2000).optional(),
    comments: z.array(reviewCommentInputSchema).max(100).optional()
}).passthrough();

export const curriculumMapWorkflowActionBodySchema = z.object({
    action: z.enum([
        'submit',
        'start_review',
        'request_revision',
        'approve',
        'reject',
        'publish',
        'return_to_draft'
    ]),
    note: z.string().trim().max(2000).optional(),
    comment: reviewCommentInputSchema.optional()
}).passthrough();

export const curriculumMapCommentBodySchema = reviewCommentInputSchema.passthrough();

export const curriculumMapCloneYearBodySchema = z.object({
    targetAcademicYear: z.string().trim().regex(/^\d{4}-\d{4}$/, 'Invalid academicYear')
}).passthrough();

export const curriculumIdParamsSchema = z.object({
    mapId: objectIdSchema
}).passthrough();

export const curriculumImportGoogleDocBodySchema = z.object({
    docId: z.string().trim().min(1).max(200).optional(),
    docUrl: z.string().trim().url().optional()
}).refine(
    (value) => Boolean(value.docId || value.docUrl),
    { message: 'docId or docUrl is required', path: ['docId'] }
).passthrough();

export const curriculumImportJobParamsSchema = z.object({
    mapId: objectIdSchema,
    jobId: objectIdSchema
}).passthrough();

export const curriculumImportApplyBodySchema = z.object({
    applyMode: z.enum(['all', 'selected']).default('all'),
    selectedSectionIds: z.array(z.string().trim().min(1).max(100)).max(300).optional(),
    expectedUpdatedAt: z.coerce.date().optional()
}).passthrough();

export const curriculumObjectiveRefinementBodySchema = z.object({
    objectives: z.array(z.string().trim().min(1).max(300)).min(1).max(30),
    context: z.object({
        subject: z.string().trim().max(120).optional(),
        grade: z.string().trim().max(80).optional(),
        weekTitle: z.string().trim().max(220).optional()
    }).optional()
}).passthrough();

export const exportQuerySchema = z.object({
    format: z.enum(['csv', 'pdf', 'html']).default('csv')
}).passthrough();

export const curriculumSettingsBodySchema = z.object({
    enabled: z.boolean().optional(),
    ai: z.object({
        enabled: z.boolean().optional(),
        allowFileImport: z.boolean().optional(),
        allowGoogleDocsImport: z.boolean().optional(),
        maxFileSizeMb: z.coerce.number().min(1).max(50).optional(),
        allowedMimeTypes: z.array(z.string().trim().min(1).max(180)).max(20).optional()
    }).optional(),
    defaultAcademicYear: z.string().trim().regex(/^\d{4}-\d{4}$/).optional(),
    weekStartDay: z.enum(['monday', 'sunday', 'saturday']).optional(),
    approvalFlow: z.enum(['draft_review_publish', 'draft_publish']).optional(),
    exports: z.object({
        allowPdf: z.boolean().optional(),
        allowCsv: z.boolean().optional(),
        allowHtml: z.boolean().optional()
    }).optional(),
    mapStructure: z.object({
        periodType: z.enum(['term', 'quarter', 'semester', 'custom']).optional(),
        granularity: z.enum(['term_only', 'unit', 'week', 'unit_week', 'strand_unit']).optional(),
        allowCustomPeriods: z.boolean().optional()
    }).optional(),
    terminology: z.object({
        period: z.string().trim().max(80).optional(),
        section: z.string().trim().max(80).optional(),
        item: z.string().trim().max(80).optional(),
        standards: z.string().trim().max(80).optional(),
        performanceTask: z.string().trim().max(80).optional()
    }).optional(),
    workflow: z.object({
        reviewEnabled: z.boolean().optional(),
        approvalRequired: z.boolean().optional(),
        allowDirectPublishWhenApprovalDisabled: z.boolean().optional()
    }).optional(),
    termTemplates: z.array(termTemplateSchema).max(12).optional(),
    templates: z.array(templateSchema).max(30).optional(),
    activeTemplateKey: z.string().trim().max(120).optional(),
    exportPreferences: z.object({
        preferredColumns: z.array(z.string().trim().max(120)).max(60).optional(),
        includeReviewerNotes: z.boolean().optional(),
        includeAuditTrail: z.boolean().optional()
    }).optional(),
    validation: z.object({
        requireMapTitle: z.boolean().optional(),
        requireAtLeastOneUnit: z.boolean().optional(),
        maxUnitsPerMap: z.coerce.number().int().min(1).max(100).optional()
    }).optional()
}).passthrough();
