export const CURRICULUM_MAP_STATUSES = [
    'draft',
    'submitted',
    'in_review',
    'revision_requested',
    'approved',
    'rejected',
    'published'
];

export const CURRICULUM_ITEM_TYPES = ['unit', 'module', 'week', 'strand', 'instructional_block'];

export const CURRICULUM_FIELD_TYPES = [
    'text',
    'long_text',
    'list_text',
    'date_range',
    'standards_links'
];

export const CURRICULUM_REVIEW_DECISIONS = ['approved', 'rejected', 'changes_requested'];

export const DEFAULT_CURRICULUM_TEMPLATE_KEY = 'default-flex-template';

const AI_ALLOWED_MIME_TYPE_ALIASES = {
    pdf: 'application/pdf',
    '.pdf': 'application/pdf',
    'application/pdf': 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    '.txt': 'text/plain',
    text: 'text/plain',
    'text/plain': 'text/plain'
};

const normalizeAiAllowedMimeTypes = (values = []) => {
    const list = Array.isArray(values) ? values : [];
    const normalized = [];
    const seen = new Set();

    for (const item of list) {
        const raw = String(item || '').trim().toLowerCase();
        if (!raw) continue;
        const canonical = AI_ALLOWED_MIME_TYPE_ALIASES[raw] || raw;
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        normalized.push(canonical);
    }

    return normalized;
};

export const createDefaultCurriculumTemplate = () => ({
    key: DEFAULT_CURRICULUM_TEMPLATE_KEY,
    name: 'Default Flexible Curriculum Map',
    isDefault: true,
    structure: {
        periodLabel: 'Term',
        sectionLabel: 'Unit',
        itemLabel: 'Week',
        granularity: 'unit_week',
        allowSectionDateRanges: true,
        allowItemDateRanges: true
    },
    labels: {
        period: 'Term',
        section: 'Unit',
        item: 'Week',
        standards: 'Standards',
        skills: 'Skills',
        learningObjectives: 'Students Will Be Able To',
        performanceTask: 'Performance Task',
        essentialQuestions: 'Essential Questions',
        activities: 'Activities/Resources',
        notes: 'Notes'
    },
    fields: [
        { key: 'standards', label: 'Standards', type: 'standards_links', enabled: true, required: false },
        { key: 'skills', label: 'Skills', type: 'list_text', enabled: true, required: false },
        { key: 'learningObjectives', label: 'Students Will Be Able To', type: 'list_text', enabled: true, required: true },
        { key: 'performanceTasks', label: 'Performance Task', type: 'list_text', enabled: true, required: false },
        { key: 'essentialQuestions', label: 'Essential Questions', type: 'list_text', enabled: true, required: false },
        { key: 'activitiesResources', label: 'Activities/Resources', type: 'list_text', enabled: true, required: false },
        { key: 'notes', label: 'Notes', type: 'long_text', enabled: true, required: false }
    ],
    requiredFields: ['title', 'academicYear', 'classId', 'subjectId'],
    workflow: {
        reviewEnabled: true,
        approvalRequired: true,
        autoAssignReviewers: true
    },
    export: {
        includeSchoolHeader: true,
        includeStatusTimeline: true,
        preferredColumns: [
            'period',
            'section',
            'item',
            'dateRange',
            'standards',
            'skills',
            'learningObjectives',
            'performanceTasks',
            'notes'
        ]
    }
});

export const createDefaultCurriculumSettings = () => ({
    enabled: true,
    ai: {
        enabled: true,
        allowFileImport: true,
        allowGoogleDocsImport: true,
        maxFileSizeMb: 10,
        allowedMimeTypes: [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
        ]
    },
    defaultAcademicYear: '',
    weekStartDay: 'monday',
    approvalFlow: 'draft_review_publish',
    overridePolicy: {
        allowTeacherOverrides: true,
        requireOverrideApproval: true
    },
    exports: {
        allowPdf: true,
        allowCsv: true,
        allowHtml: true
    },
    validation: {
        requireMapTitle: true,
        requireAtLeastOneUnit: true,
        maxUnitsPerMap: 24
    },
    mapStructure: {
        periodType: 'term',
        granularity: 'unit_week',
        allowCustomPeriods: true
    },
    terminology: {
        period: 'Term',
        section: 'Unit',
        item: 'Week',
        standards: 'Standards',
        performanceTask: 'Performance Task'
    },
    workflow: {
        reviewEnabled: true,
        approvalRequired: true,
        allowDirectPublishWhenApprovalDisabled: true
    },
    templates: [createDefaultCurriculumTemplate()],
    activeTemplateKey: DEFAULT_CURRICULUM_TEMPLATE_KEY,
    exportPreferences: {
        preferredColumns: createDefaultCurriculumTemplate().export.preferredColumns,
        includeReviewerNotes: true,
        includeAuditTrail: true
    }
});

const mergeArraysByTemplateKey = (target = [], source = []) => {
    if (!Array.isArray(source) || source.length === 0) return target;
    const byKey = new Map();
    for (const template of target) {
        byKey.set(template.key, template);
    }
    for (const template of source) {
        if (!template?.key) continue;
        byKey.set(template.key, { ...(byKey.get(template.key) || {}), ...template });
    }
    return [...byKey.values()];
};

export const deepMergeCurriculumSettings = (target = {}, source = {}) => {
    const output = { ...target };
    for (const [key, value] of Object.entries(source || {})) {
        if (key === 'templates') {
            output.templates = mergeArraysByTemplateKey(output.templates || [], value || []);
            continue;
        }
        if (Array.isArray(value)) {
            output[key] = [...value];
            continue;
        }
        if (value && typeof value === 'object') {
            output[key] = deepMergeCurriculumSettings(output[key] || {}, value);
            continue;
        }
        output[key] = value;
    }
    return output;
};

export const normalizeLegacyStatus = ({ status, reviewDecision }) => {
    if (CURRICULUM_MAP_STATUSES.includes(status)) return status;
    if (status === 'in_review') {
        if (reviewDecision === 'approved') return 'approved';
        if (reviewDecision === 'rejected') return 'rejected';
        if (reviewDecision === 'changes_requested') return 'revision_requested';
        return 'in_review';
    }
    if (status === 'published') return 'published';
    return 'draft';
};

export const normalizeCurriculumSettings = (settings = {}) => {
    const defaults = createDefaultCurriculumSettings();
    const merged = deepMergeCurriculumSettings(defaults, settings || {});

    const normalizedAllowedMimeTypes = normalizeAiAllowedMimeTypes(merged?.ai?.allowedMimeTypes);
    merged.ai = {
        ...(merged.ai || {}),
        allowedMimeTypes: normalizedAllowedMimeTypes.length > 0
            ? normalizedAllowedMimeTypes
            : [...defaults.ai.allowedMimeTypes]
    };

    if (!Array.isArray(merged.templates) || merged.templates.length === 0) {
        merged.templates = [createDefaultCurriculumTemplate()];
    }

    if (!merged.activeTemplateKey) {
        merged.activeTemplateKey = merged.templates[0].key;
    }

    const activeExists = merged.templates.some((template) => template.key === merged.activeTemplateKey);
    if (!activeExists) {
        merged.activeTemplateKey = merged.templates[0].key;
    }

    return merged;
};

export const resolveActiveTemplate = (settings = {}) => {
    const normalized = normalizeCurriculumSettings(settings);
    const activeTemplate = normalized.templates.find((template) => template.key === normalized.activeTemplateKey);
    return {
        settings: normalized,
        template: activeTemplate || normalized.templates[0] || createDefaultCurriculumTemplate()
    };
};
