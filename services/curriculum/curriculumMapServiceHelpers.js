import {
    canEditAnyCurriculumMap,
    canManageCurriculumMap
} from './curriculumAccessService.js';
import { assertCondition } from './curriculumErrors.js';
import {
    normalizeLegacyStatus,
    resolveActiveTemplate
} from './curriculumTemplateDefaults.js';
import {
    buildAuditEntry,
    isDepartmentAllowed,
    toObjectIdString
} from './curriculumUtils.js';

const toWeek = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    if (number < 1 || number > 53) return null;
    return Math.round(number);
};

const toStringList = (value = []) => (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);

const toDateRange = (dateRange = {}) => ({
    startDate: dateRange?.startDate ? new Date(dateRange.startDate) : null,
    endDate: dateRange?.endDate ? new Date(dateRange.endDate) : null
});

const toTemplateSnapshot = (template, settings) => ({
    template,
    terminology: settings?.terminology || {},
    workflow: settings?.workflow || {},
    exportPreferences: settings?.exportPreferences || {}
});

const toItemFromUnit = (unit = {}, index = 0) => {
    const title = String(unit.title || '').trim();
    const startWeek = toWeek(unit.startWeek) || 1;
    const endWeek = toWeek(unit.endWeek) || startWeek;
    const standardsText = String(unit.standards || '').trim();
    const standardTokens = standardsText
        ? standardsText.split('|').map((item) => item.trim()).filter(Boolean)
        : [];

    return {
        title: title || `Instructional Block ${index + 1}`,
        type: 'instructional_block',
        orderIndex: index,
        dateRange: { startDate: null, endDate: null },
        startWeek,
        endWeek,
        standards: [
            ...standardTokens.map((code) => ({
                standardId: null,
                sourceType: 'custom_entry',
                code,
                title: '',
                description: '',
                framework: ''
            })),
            ...(Array.isArray(unit.standardIds)
                ? unit.standardIds.filter(Boolean).map((standardId) => ({
                    standardId,
                    sourceType: 'school_defined',
                    code: '',
                    title: '',
                    description: '',
                    framework: ''
                }))
                : [])
        ],
        skills: toStringList(String(unit.skills || '').split('|')),
        learningObjectives: toStringList(String(unit.studentOutcomes || '').split('|')),
        essentialQuestions: [],
        activitiesResources: toStringList(unit.resources || []),
        performanceTasks: toStringList(String(unit.performanceTask || '').split('|')),
        assessment: '',
        notes: String(unit.notes || '').trim(),
        customFieldValues: []
    };
};

export const buildSectionsFromLegacyUnits = ({ units = [], template }) => {
    if (!Array.isArray(units) || units.length === 0) return [];

    const label = template?.labels?.period || template?.structure?.periodLabel || 'Instructional Period';
    return [{
        title: label,
        orderIndex: 0,
        sectionType: 'period',
        dateRange: { startDate: null, endDate: null },
        items: units.map(toItemFromUnit)
    }];
};

export const buildLegacyUnitsFromSections = ({ sections = [] }) => {
    const units = [];
    for (const section of sections || []) {
        const items = Array.isArray(section?.items) ? section.items : [];
        for (const item of items) {
            const startWeek = toWeek(item?.startWeek);
            const endWeek = toWeek(item?.endWeek ?? item?.startWeek);
            if (!startWeek || !endWeek) continue;

            units.push({
                unitCode: '',
                title: item.title || '',
                description: '',
                standards: toStringList((item.standards || []).map((standard) => standard.code || standard.title)).join(' | '),
                skills: toStringList(item.skills).join(' | '),
                studentOutcomes: toStringList(item.learningObjectives).join(' | '),
                performanceTask: toStringList(item.performanceTasks).join(' | '),
                startWeek,
                endWeek,
                estimatedWeeks: Math.max(1, endWeek - startWeek + 1),
                standardIds: toStringList((item.standards || []).map((standard) => standard.standardId))
                    .map((value) => value || null)
                    .filter(Boolean),
                resources: toStringList(item.activitiesResources),
                notes: String(item.notes || '').trim()
            });
        }
    }
    return units;
};

const normalizeItem = (item = {}, index = 0) => ({
    title: String(item.title || '').trim() || `Instructional Block ${index + 1}`,
    type: item.type || 'instructional_block',
    orderIndex: Number.isFinite(Number(item.orderIndex)) ? Number(item.orderIndex) : index,
    dateRange: toDateRange(item.dateRange),
    startWeek: toWeek(item.startWeek),
    endWeek: toWeek(item.endWeek ?? item.startWeek),
    standards: Array.isArray(item.standards) ? item.standards : [],
    skills: toStringList(item.skills),
    learningObjectives: toStringList(item.learningObjectives),
    essentialQuestions: toStringList(item.essentialQuestions),
    activitiesResources: toStringList(item.activitiesResources),
    performanceTasks: toStringList(item.performanceTasks),
    assessment: String(item.assessment || '').trim(),
    notes: String(item.notes || '').trim(),
    customFieldValues: Array.isArray(item.customFieldValues) ? item.customFieldValues : []
});

const normalizeSection = (section = {}, index = 0) => ({
    title: String(section.title || '').trim() || `Section ${index + 1}`,
    orderIndex: Number.isFinite(Number(section.orderIndex)) ? Number(section.orderIndex) : index,
    sectionType: String(section.sectionType || 'period').trim(),
    dateRange: toDateRange(section.dateRange),
    items: (Array.isArray(section.items) ? section.items : []).map(normalizeItem)
});

export const normalizeSections = (sections = []) => (Array.isArray(sections) ? sections : [])
    .map(normalizeSection)
    .sort((left, right) => Number(left.orderIndex || 0) - Number(right.orderIndex || 0))
    .map((section) => ({
        ...section,
        items: (section.items || [])
            .sort((left, right) => Number(left.orderIndex || 0) - Number(right.orderIndex || 0))
    }));

export const resolveTemplateForRequest = ({ settings, requestedTemplateKey }) => {
    const resolved = resolveActiveTemplate(settings || {});
    if (!requestedTemplateKey) return resolved;

    const requested = resolved.settings.templates.find((template) => template.key === requestedTemplateKey);
    if (!requested) return resolved;

    return {
        settings: resolved.settings,
        template: requested
    };
};

export const buildNormalizedMapPayload = ({ body = {}, settings = {} }) => {
    const resolvedTemplate = resolveTemplateForRequest({
        settings,
        requestedTemplateKey: body.templateKey
    });
    const sectionsFromBody = normalizeSections(body.sections || []);
    const sections = sectionsFromBody.length > 0
        ? sectionsFromBody
        : buildSectionsFromLegacyUnits({ units: body.units || [], template: resolvedTemplate.template });
    const units = Array.isArray(body.units) && body.units.length > 0
        ? body.units
        : buildLegacyUnitsFromSections({ sections });

    return {
        templateKey: resolvedTemplate.template.key,
        templateSnapshot: toTemplateSnapshot(resolvedTemplate.template, resolvedTemplate.settings),
        structure: {
            periodType: body?.structure?.periodType || resolvedTemplate.settings.mapStructure?.periodType || 'term',
            granularity: body?.structure?.granularity || resolvedTemplate.template.structure?.granularity || resolvedTemplate.settings.mapStructure?.granularity || 'unit_week',
            sectionLabel: body?.structure?.sectionLabel || resolvedTemplate.settings.terminology?.section || resolvedTemplate.template.structure?.sectionLabel || 'Unit',
            itemLabel: body?.structure?.itemLabel || resolvedTemplate.settings.terminology?.item || resolvedTemplate.template.structure?.itemLabel || 'Week'
        },
        sections,
        units
    };
};

export const hydrateMapForResponse = ({ map, settings = {} }) => {
    if (!map) return map;
    const target = map.toObject ? map.toObject() : map;
    const resolvedTemplate = resolveTemplateForRequest({
        settings,
        requestedTemplateKey: target.templateKey
    });

    const sections = normalizeSections(target.sections || []);
    const hydratedSections = sections.length > 0
        ? sections
        : buildSectionsFromLegacyUnits({ units: target.units || [], template: resolvedTemplate.template });

    const status = normalizeLegacyStatus({
        status: target.status,
        reviewDecision: target.workflow?.reviewDecision || null
    });

    return {
        ...target,
        status,
        templateKey: target.templateKey || resolvedTemplate.template.key,
        templateSnapshot: target.templateSnapshot || toTemplateSnapshot(resolvedTemplate.template, resolvedTemplate.settings),
        structure: {
            periodType: target?.structure?.periodType || resolvedTemplate.settings.mapStructure?.periodType || 'term',
            granularity: target?.structure?.granularity || resolvedTemplate.template.structure?.granularity || 'unit_week',
            sectionLabel: target?.structure?.sectionLabel || resolvedTemplate.settings.terminology?.section || 'Unit',
            itemLabel: target?.structure?.itemLabel || resolvedTemplate.settings.terminology?.item || 'Week'
        },
        sections: hydratedSections,
        workflow: {
            ...(target.workflow || {}),
            currentState: status
        }
    };
};

export const toMapScopeKey = ({ classId, subjectId }) => `${toObjectIdString(classId)}:${toObjectIdString(subjectId)}`;

export const ensureTeacherMapScope = async ({ repository, req, map, errorMessage = 'You can only access maps for your assigned class and subject' }) => {
    if (req.user.role !== 'teacher' || canManageCurriculumMap(req.user)) {
        return;
    }
    const scope = await repository.getTeacherScope({ schoolId: req.schoolId, userId: req.user._id });
    const key = toMapScopeKey({
        classId: map.classId?._id || map.classId,
        subjectId: map.subject?._id || map.subject || map.subjectId
    });
    assertCondition(scope.classSubjectKeys.includes(key), 403, errorMessage);
};

export const buildTeacherVisibleFilter = async ({ repository, req }) => {
    const scope = await repository.getTeacherScope({ schoolId: req.schoolId, userId: req.user._id });
    if (!scope.classSubjectKeys.length) {
        return { _id: { $in: [] } };
    }

    const classSubjectFilters = scope.classSubjectKeys.map((key) => {
        const [classId, subject] = key.split(':');
        return { classId, subject };
    });
    const scopeFilter = { $or: classSubjectFilters };

    if (req.query.status === 'published') {
        return scopeFilter;
    }

    if (req.query.status && req.query.status !== 'published') {
        return { $and: [scopeFilter, { createdBy: req.user._id }] };
    }

    return {
        $or: [
            { $and: [scopeFilter, { status: 'published' }] },
            { $and: [scopeFilter, { createdBy: req.user._id }] }
        ]
    };
};

export const isTeacherLimited = (req) => req.user.role === 'teacher' && !canManageCurriculumMap(req.user);

export const isOwnedBy = (entity, userId) => toObjectIdString(entity?.createdBy?._id || entity?.createdBy) === toObjectIdString(userId);

export const assertTeacherOwnership = ({ req, map, message }) => {
    if (!isTeacherLimited(req)) return;
    if (canEditAnyCurriculumMap(req.user)) return;
    assertCondition(isOwnedBy(map, req.user._id), 403, message);
};

export const toMapScope = (map) => ({
    classId: map.classId?._id || map.classId,
    subjectId: map.subject?._id || map.subject
});

export const validateClassForMapCreation = ({ req, classDoc }) => {
    assertCondition(classDoc, 404, 'Class not found');
    assertCondition(isDepartmentAllowed(req.departmentId, classDoc.department), 403, 'Class outside your department scope');
    if (req.body.departmentId) {
        assertCondition(isDepartmentAllowed(req.body.departmentId, classDoc.department), 400, 'Department must match class department');
    }
};

export const buildMapCreatePayload = ({ req, classDoc, settings }) => {
    const normalized = buildNormalizedMapPayload({ body: req.body, settings });

    return {
        school: req.schoolId,
        academicYear: req.body.academicYear,
        classId: req.body.classId,
        grade: Number(classDoc.grade),
        subject: req.body.subjectId,
        department: classDoc.department || req.departmentId || null,
        templateKey: normalized.templateKey,
        templateSnapshot: normalized.templateSnapshot,
        structure: normalized.structure,
        title: req.body.title,
        description: req.body.description || '',
        status: 'draft',
        version: 1,
        isCurrent: true,
        sections: normalized.sections,
        units: normalized.units,
        planningTemplate: req.body.planningTemplate || {},
        createdBy: req.user._id,
        updatedBy: req.user._id,
        workflow: { currentState: 'draft' },
        auditTrail: [buildAuditEntry({ action: 'created', actor: req.user._id, message: 'Curriculum map created' })],
        workflowHistory: [buildAuditEntry({ action: 'workflow_draft', actor: req.user._id, message: 'Map created in draft state' })]
    };
};

export const buildVersionPayload = ({ sourceMap, req, settings }) => {
    const source = hydrateMapForResponse({ map: sourceMap, settings });
    return {
        school: req.schoolId,
        academicYear: source.academicYear,
        classId: source.classId?._id || source.classId,
        grade: source.grade,
        subject: source.subject?._id || source.subject,
        department: source.department || null,
        templateKey: source.templateKey,
        templateSnapshot: source.templateSnapshot,
        structure: source.structure,
        title: source.title,
        description: source.description,
        status: 'draft',
        version: Number(source.version || 1) + 1,
        isCurrent: true,
        previousVersionMapId: source._id,
        sections: source.sections || [],
        units: source.units || [],
        planningTemplate: source.planningTemplate || {},
        createdBy: req.user._id,
        updatedBy: req.user._id,
        workflow: { currentState: 'draft' },
        auditTrail: [buildAuditEntry({ action: 'version_created', actor: req.user._id, message: 'Created from published map' })],
        workflowHistory: [buildAuditEntry({ action: 'workflow_draft', actor: req.user._id, message: 'Version created in draft state' })]
    };
};

export const buildClonePayload = ({ sourceMap, req, settings }) => {
    const source = hydrateMapForResponse({ map: sourceMap, settings });
    return {
        school: req.schoolId,
        academicYear: req.body.targetAcademicYear,
        classId: source.classId?._id || source.classId,
        grade: source.grade,
        subject: source.subject?._id || source.subject,
        department: source.department || null,
        templateKey: source.templateKey,
        templateSnapshot: source.templateSnapshot,
        structure: source.structure,
        title: source.title,
        description: source.description,
        status: 'draft',
        version: 1,
        isCurrent: true,
        sections: source.sections || [],
        units: source.units || [],
        planningTemplate: source.planningTemplate || {},
        createdBy: req.user._id,
        updatedBy: req.user._id,
        workflow: { currentState: 'draft' },
        auditTrail: [buildAuditEntry({ action: 'cloned_year', actor: req.user._id, message: `Cloned to ${req.body.targetAcademicYear}` })],
        workflowHistory: [buildAuditEntry({ action: 'workflow_draft', actor: req.user._id, message: 'Cloned map starts in draft state' })]
    };
};
