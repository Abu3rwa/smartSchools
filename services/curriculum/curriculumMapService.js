import { PERMISSIONS } from '../../config/permissions.js';
import { curriculumExportService } from './curriculumExportService.js';
import { assertCondition, createHttpError } from './curriculumErrors.js';
import { curriculumNotificationService } from './curriculumNotificationService.js';
import { curriculumRepository } from './curriculumRepository.js';
import {
    canApproveCurriculumMap,
    canCreateCurriculumMap,
    canEditCurriculumMap,
    canManageCurriculumMap,
    canExportCurriculumMap,
    canPublishCurriculumMap,
    canRejectCurriculumMap,
    canReviewCurriculumMap,
    canViewCurriculumMap
} from './curriculumAccessService.js';
import {
    applyWorkflowAction,
    resolveWorkflowPolicy
} from './curriculumWorkflowService.js';
import {
    buildAuditEntry,
    buildPaginationResult,
    ensurePagination,
    isDepartmentAllowed
} from './curriculumUtils.js';
import {
    assertTeacherOwnership,
    buildClonePayload,
    buildMapCreatePayload,
    buildNormalizedMapPayload,
    buildTeacherVisibleFilter,
    buildVersionPayload,
    ensureTeacherMapScope,
    hydrateMapForResponse,
    isOwnedBy,
    isTeacherLimited,
    toMapScope,
    validateClassForMapCreation
} from './curriculumMapServiceHelpers.js';
import {
    normalizeCurriculumSettings,
    normalizeLegacyStatus
} from './curriculumTemplateDefaults.js';
import { createCurriculumAiImportService } from './curriculumAiImportService.js';

const toComparableTime = (value) => new Date(value).getTime();
const EDITABLE_STATUSES = ['draft', 'revision_requested', 'rejected'];
const REVIEW_ACTIONS = ['start_review', 'request_revision', 'approve', 'reject'];

const toDecisionAction = (decision) => {
    if (decision === 'approved') return 'approve';
    if (decision === 'rejected') return 'reject';
    return 'request_revision';
};

const getCurriculumSettings = async (repository, schoolId) => {
    const school = await repository.findSchoolById(schoolId);
    assertCondition(school, 404, 'School not found');
    return normalizeCurriculumSettings(school.settings?.curriculum || {});
};

const shouldApprovalBeRequired = (settings) => {
    if (settings?.approvalFlow === 'draft_publish') return false;
    return settings?.workflow?.approvalRequired !== false;
};

const resolveMapPolicy = ({ settings, map }) => resolveWorkflowPolicy(settings, map?.templateSnapshot?.template || null);

const hydrateMaps = ({ maps = [], settings }) => maps.map((map) => hydrateMapForResponse({ map, settings }));

const ensureCanEditMap = ({ req, map }) => {
    assertCondition(canEditCurriculumMap(req.user), 403, 'Not authorized to update curriculum maps');
    assertTeacherOwnership({ req, map, message: 'Teachers can only edit maps they created' });
};

const ensureTransitionPermission = ({ req, action, map }) => {
    if (action === 'submit' || action === 'return_to_draft') {
        ensureCanEditMap({ req, map });
        return;
    }
    if (action === 'publish') {
        assertCondition(canPublishCurriculumMap(req.user), 403, 'Not authorized to publish curriculum maps');
        return;
    }
    if (action === 'approve') {
        assertCondition(canApproveCurriculumMap(req.user), 403, 'Not authorized to approve curriculum maps');
        return;
    }
    if (action === 'reject') {
        assertCondition(canRejectCurriculumMap(req.user), 403, 'Not authorized to reject curriculum maps');
        return;
    }
    if (REVIEW_ACTIONS.includes(action)) {
        assertCondition(canReviewCurriculumMap(req.user), 403, 'Not authorized to review curriculum maps');
        return;
    }
    throw createHttpError(400, 'Unsupported workflow action');
};

const assertMapVersion = (req, map) => {
    if (!req.body.expectedUpdatedAt) return;
    const expected = toComparableTime(req.body.expectedUpdatedAt);
    const actual = toComparableTime(map.updatedAt);
    assertCondition(expected === actual, 409, 'Map has changed since last fetch', { code: 'VERSION_CONFLICT' });
};

const appendReviewComments = ({ map, req, comments = [], fallbackType = 'comment' }) => {
    const list = Array.isArray(comments) ? comments : [];
    if (list.length === 0) return;
    const entries = list.map((comment) => ({
        scope: {
            targetType: comment.scope?.targetType || 'map',
            sectionId: comment.scope?.sectionId || null,
            itemId: comment.scope?.itemId || null,
            fieldKey: comment.scope?.fieldKey || ''
        },
        commentType: comment.commentType || fallbackType,
        message: comment.message,
        createdBy: req.user._id,
        createdAt: new Date()
    }));
    map.reviewComments = [...(map.reviewComments || []), ...entries];
};

const notifyApprovers = async ({ repository, notificationService, req, map }) => {
    const approvers = await repository.listApprovers({
        schoolId: req.schoolId,
        departmentId: map.department || req.departmentId || null,
        permission: PERMISSIONS.REVIEW_CURRICULUM_MAPS
    });
    return notificationService.notifyUsers({
        schoolId: req.schoolId,
        userIds: approvers.map((user) => user._id),
        subject: `Curriculum map submitted: ${map.title}`,
        message: 'A curriculum map is waiting for review.',
        actorId: req.user._id,
        metadata: { mapId: String(map._id), event: 'curriculum_map_submitted' }
    });
};

const notifyMapOwner = async ({ notificationService, req, map, action, note }) => {
    if (isOwnedBy(map, req.user._id)) return;
    return notificationService.notifyUsers({
        schoolId: req.schoolId,
        userIds: [map.createdBy],
        subject: `Curriculum map review update: ${map.title}`,
        message: `Action: ${action}${note ? ` - ${note}` : ''}`,
        actorId: req.user._id,
        metadata: { mapId: String(map._id), event: 'curriculum_map_reviewed', action }
    });
};

const runPublishSideEffects = async ({ repository, req, map }) => {
    await repository.clearCurrentMap({
        schoolId: req.schoolId,
        academicYear: map.academicYear,
        classId: map.classId?._id || map.classId,
        subjectId: map.subject?._id || map.subject
    });
    map.isCurrent = true;
};

const buildTransitionPolicy = ({ settings, map }) => {
    const policy = resolveMapPolicy({ settings, map });
    return { ...policy, approvalRequired: shouldApprovalBeRequired(settings) };
};

const notifyTransition = async ({ repository, notificationService, req, map, action, note }) => {
    if (action === 'submit') {
        await notifyApprovers({ repository, notificationService, req, map });
        return;
    }
    if (REVIEW_ACTIONS.includes(action)) {
        await notifyMapOwner({ notificationService, req, map, action, note });
    }
};

const applyMapTransition = async ({
    repository,
    notificationService,
    req,
    map,
    action,
    note,
    comments = [],
    settings
}) => {
    map.status = normalizeLegacyStatus({
        status: map.status,
        reviewDecision: map.workflow?.reviewDecision || null
    });
    ensureTransitionPermission({ req, action, map });
    assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
    await ensureTeacherMapScope({ repository, req, map });

    const policy = buildTransitionPolicy({ settings, map });
    applyWorkflowAction({ map, action, actorId: req.user._id, note, policy });
    appendReviewComments({
        map,
        req,
        comments,
        fallbackType: action === 'request_revision' ? 'revision_request' : 'comment'
    });

    if (action === 'publish') {
        await runPublishSideEffects({ repository, req, map });
    }

    await repository.saveCurriculumMap(map);
    await notifyTransition({ repository, notificationService, req, map, action, note });

    return repository.findCurriculumMapById(map._id);
};

const applyQueryFilter = (query, key, value, mapper = (item) => item) => {
    if (value == null || value === '') return;
    query[key] = mapper(value);
};

const buildMapListQuery = async ({ repository, req }) => {
    const query = {};
    applyQueryFilter(query, 'academicYear', req.query.academicYear);
    applyQueryFilter(query, 'classId', req.query.classId);
    applyQueryFilter(query, 'subject', req.query.subjectId);
    applyQueryFilter(query, 'createdBy', req.query.teacherId);
    applyQueryFilter(query, 'status', req.query.status);
    applyQueryFilter(query, 'templateKey', req.query.templateKey);
    applyQueryFilter(query, 'title', req.query.search, (term) => ({ $regex: term, $options: 'i' }));
    applyQueryFilter(query, 'department', req.departmentId);

    if (isTeacherLimited(req)) {
        const teacherFilter = await buildTeacherVisibleFilter({ repository, req });
        query.$and = [...(query.$and || []), teacherFilter];
    }
    return query;
};

const buildCurriculumOptions = async ({ repository, req }) => {
    if (isTeacherLimited(req)) {
        const scope = await repository.getTeacherScope({ schoolId: req.schoolId, userId: req.user._id });
        const [classes, subjects] = await Promise.all([
            repository.listCurriculumOptionClasses({
                schoolId: req.schoolId,
                departmentId: req.departmentId,
                classIds: scope.classIds
            }),
            repository.listCurriculumOptionSubjects({
                schoolId: req.schoolId,
                subjectIds: scope.subjectIds
            })
        ]);

        const classIdSet = new Set(classes.map((item) => String(item._id)));
        const subjectIdSet = new Set(subjects.map((item) => String(item._id)));
        const classSubjectPairs = (scope.classSubjectKeys || [])
            .map((key) => {
                const [classId, subjectId] = String(key || '').split(':');
                return { classId, subjectId };
            })
            .filter((pair) => classIdSet.has(pair.classId) && subjectIdSet.has(pair.subjectId));

        return { classes, subjects, classSubjectPairs };
    }

    const [classes, subjects] = await Promise.all([
        repository.listCurriculumOptionClasses({
            schoolId: req.schoolId,
            departmentId: req.departmentId
        }),
        repository.listCurriculumOptionSubjects({
            schoolId: req.schoolId
        })
    ]);

    return { classes, subjects, classSubjectPairs: [] };
};

const assertExportAllowed = ({ settings, format }) => {
    const exportFlags = {
        csv: settings.exports?.allowCsv !== false,
        pdf: settings.exports?.allowPdf !== false,
        html: settings.exports?.allowHtml !== false
    };
    assertCondition(exportFlags[format], 403, `${format.toUpperCase()} export is disabled for this school`);
};

const buildMapExportFile = ({ exportService, map, settings, format }) => {
    const definitions = {
        pdf: {
            contentType: 'application/pdf',
            filename: `curriculum-map-${map._id}.pdf`,
            buffer: exportService.exportCurriculumMapAsPdf(map, settings)
        },
        html: {
            contentType: 'text/html; charset=utf-8',
            filename: `curriculum-map-${map._id}.html`,
            text: exportService.exportCurriculumMapAsHtml(map, settings)
        },
        csv: {
            contentType: 'text/csv; charset=utf-8',
            filename: `curriculum-map-${map._id}.csv`,
            text: exportService.exportCurriculumMapAsCsv(map, settings)
        }
    };
    return definitions[format] || null;
};

// eslint-disable-next-line max-lines-per-function
export const createCurriculumMapService = ({
    repository = curriculumRepository,
    notificationService = curriculumNotificationService,
    exportService = curriculumExportService,
    aiImportService = null
} = {}) => {
    const resolvedAiImportService = aiImportService || createCurriculumAiImportService({
        repository,
        notificationService
    });

    return ({
    async createCurriculumMap({ req }) {
        assertCondition(canCreateCurriculumMap(req.user), 403, 'Not authorized to create curriculum maps');
        const classDoc = await repository.findClassById(req.body.classId);
        validateClassForMapCreation({ req, classDoc });
        await ensureTeacherMapScope({
            repository,
            req,
            map: { classId: req.body.classId, subjectId: req.body.subjectId },
            errorMessage: 'You can only create maps for your assigned class and subject'
        });

        const existing = await repository.findCurrentCurriculumMapByScope({
            schoolId: req.schoolId,
            academicYear: req.body.academicYear,
            classId: req.body.classId,
            subjectId: req.body.subjectId
        });
        assertCondition(!existing, 409, 'A current map already exists for this class, subject, and year');

        const settings = await getCurriculumSettings(repository, req.schoolId);
        const created = await repository.createCurriculumMap(buildMapCreatePayload({ req, classDoc, settings }));
        const map = await repository.findCurriculumMapById(created._id);
        return hydrateMapForResponse({ map, settings });
    },

    async listCurriculumMaps({ req }) {
        assertCondition(canViewCurriculumMap(req.user), 403, 'Not authorized to view curriculum maps');
        const pagination = ensurePagination(req.query);
        const query = await buildMapListQuery({ repository, req });

        const [items, total, settings] = await Promise.all([
            repository.listCurriculumMaps(query, pagination),
            repository.countCurriculumMaps(query),
            getCurriculumSettings(repository, req.schoolId)
        ]);

        return {
            items: hydrateMaps({ maps: items, settings }),
            pagination: buildPaginationResult({ page: pagination.page, limit: pagination.limit, total })
        };
    },

    async listCurriculumOptions({ req }) {
        assertCondition(canViewCurriculumMap(req.user), 403, 'Not authorized to view curriculum maps');
        return buildCurriculumOptions({ repository, req });
    },

    async getCurriculumMapById({ req }) {
        assertCondition(canViewCurriculumMap(req.user), 403, 'Not authorized to view curriculum maps');
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map });
        if (isTeacherLimited(req)) {
            assertCondition(map.status === 'published' || isOwnedBy(map, req.user._id), 403, 'Teachers can only view published maps or maps they created');
        }

        const settings = await getCurriculumSettings(repository, req.schoolId);
        return hydrateMapForResponse({ map, settings });
    },

    async updateCurriculumMap({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map });
        ensureCanEditMap({ req, map });
        assertCondition(EDITABLE_STATUSES.includes(map.status), 409, 'Only draft or revision-needed maps can be edited');
        assertMapVersion(req, map);

        const settings = await getCurriculumSettings(repository, req.schoolId);
        const normalized = buildNormalizedMapPayload({ body: req.body, settings });
        if (req.body.title !== undefined) map.title = req.body.title;
        if (req.body.description !== undefined) map.description = req.body.description;
        if (req.body.templateKey !== undefined) map.templateKey = normalized.templateKey;
        if (req.body.structure !== undefined) map.structure = normalized.structure;
        if (req.body.sections !== undefined || req.body.units !== undefined) {
            map.sections = normalized.sections;
            map.units = normalized.units;
        }
        if (req.body.planningTemplate !== undefined) map.planningTemplate = req.body.planningTemplate;
        map.updatedBy = req.user._id;
        map.status = 'draft';
        map.workflow.currentState = 'draft';
        map.auditTrail.push(buildAuditEntry({ action: 'updated', actor: req.user._id, message: 'Draft updated' }));
        await repository.saveCurriculumMap(map);
        const latest = await repository.findCurriculumMapById(map._id);
        return hydrateMapForResponse({ map: latest, settings });
    },

    async deleteCurriculumMap({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(canManageCurriculumMap(req.user), 403, 'Not authorized to delete curriculum maps');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map });

        await Promise.all([
            repository.deleteCurriculumImportJobsByMap({ schoolId: req.schoolId, mapId: map._id }),
            repository.deleteCurriculumSourceDocumentsByMap({ schoolId: req.schoolId, mapId: map._id })
        ]);
        await repository.deleteCurriculumMapById(map._id);

        return { deleted: true, mapId: String(map._id) };
    },

    async submitCurriculumMapForReview({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        const settings = await getCurriculumSettings(repository, req.schoolId);
        const updated = await applyMapTransition({
            repository,
            notificationService,
            req,
            map,
            action: 'submit',
            note: req.body?.note || '',
            comments: req.body?.comments || [],
            settings
        });
        return hydrateMapForResponse({ map: updated, settings });
    },

    async reviewCurriculumMap({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        const action = toDecisionAction(req.body.decision);
        const settings = await getCurriculumSettings(repository, req.schoolId);
        const updated = await applyMapTransition({
            repository,
            notificationService,
            req,
            map,
            action,
            note: req.body.note || '',
            comments: req.body.comments || [],
            settings
        });
        return hydrateMapForResponse({ map: updated, settings });
    },

    async publishCurriculumMap({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        const settings = await getCurriculumSettings(repository, req.schoolId);
        const updated = await applyMapTransition({
            repository,
            notificationService,
            req,
            map,
            action: 'publish',
            note: req.body?.note || '',
            comments: req.body?.comments || [],
            settings
        });
        return hydrateMapForResponse({ map: updated, settings });
    },

    async transitionCurriculumMap({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        const settings = await getCurriculumSettings(repository, req.schoolId);
        const commentPayload = req.body.comment ? [req.body.comment] : [];
        const updated = await applyMapTransition({
            repository,
            notificationService,
            req,
            map,
            action: req.body.action,
            note: req.body.note || '',
            comments: commentPayload,
            settings
        });
        return hydrateMapForResponse({ map: updated, settings });
    },

    async addCurriculumMapComment({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(canViewCurriculumMap(req.user), 403, 'Not authorized to comment on curriculum maps');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map });
        appendReviewComments({ map, req, comments: [req.body], fallbackType: req.body.commentType || 'comment' });
        map.updatedBy = req.user._id;
        map.auditTrail.push(buildAuditEntry({ action: 'comment_added', actor: req.user._id, message: 'Review comment added' }));
        await repository.saveCurriculumMap(map);
        const settings = await getCurriculumSettings(repository, req.schoolId);
        return hydrateMapForResponse({ map: await repository.findCurriculumMapById(map._id), settings });
    },

    async getCurriculumMapHistory({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(canViewCurriculumMap(req.user), 403, 'Not authorized to view curriculum maps');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map });
        return {
            workflowHistory: map.workflowHistory || [],
            auditTrail: map.auditTrail || [],
            reviewComments: map.reviewComments || []
        };
    },

    async uploadCurriculumImportSource({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map });
        ensureCanEditMap({ req, map });
        const settings = await getCurriculumSettings(repository, req.schoolId);
        return resolvedAiImportService.createUploadSourceAndJob({
            req,
            map,
            settings,
            file: req.file
        });
    },

    async importCurriculumSourceFromGoogleDoc({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map });
        ensureCanEditMap({ req, map });
        const settings = await getCurriculumSettings(repository, req.schoolId);
        return resolvedAiImportService.createGoogleDocSourceAndJob({
            req,
            map,
            settings,
            payload: req.body
        });
    },

    async listCurriculumImportSources({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(canViewCurriculumMap(req.user), 403, 'Not authorized to view curriculum maps');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map });
        return resolvedAiImportService.listSourcesAndJobs({
            schoolId: req.schoolId,
            mapId: map._id
        });
    },

    async getCurriculumImportJob({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(canViewCurriculumMap(req.user), 403, 'Not authorized to view curriculum maps');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map });
        const job = await resolvedAiImportService.getJobByScope({
            schoolId: req.schoolId,
            mapId: map._id,
            jobId: req.params.jobId
        });
        return { job };
    },

    async applyCurriculumImportJob({ req }) {
        const map = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map });
        ensureCanEditMap({ req, map });

        const job = await resolvedAiImportService.getJobByScope({
            schoolId: req.schoolId,
            mapId: map._id,
            jobId: req.params.jobId
        });

        await resolvedAiImportService.applyJobSuggestions({
            req,
            map,
            job,
            body: req.body
        });

        const settings = await getCurriculumSettings(repository, req.schoolId);
        const latest = await repository.findCurriculumMapById(map._id);
        const refreshedJob = await resolvedAiImportService.getJobByScope({
            schoolId: req.schoolId,
            mapId: map._id,
            jobId: req.params.jobId
        });
        return {
            map: hydrateMapForResponse({ map: latest, settings }),
            job: refreshedJob
        };
    },

    async createMapVersion({ req }) {
        assertCondition(canEditCurriculumMap(req.user), 403, 'Not authorized to version curriculum maps');
        const sourceMap = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(sourceMap, 404, 'Curriculum map not found');
        assertCondition(sourceMap.status === 'published', 409, 'Only published maps can be versioned');
        assertCondition(isDepartmentAllowed(req.departmentId, sourceMap.department), 403, 'Map outside your department scope');
        await ensureTeacherMapScope({ repository, req, map: sourceMap });
        assertTeacherOwnership({ req, map: sourceMap, message: 'Teachers can only version maps they created' });

        await repository.clearCurrentMap({
            schoolId: req.schoolId,
            academicYear: sourceMap.academicYear,
            ...toMapScope(sourceMap)
        });
        const settings = await getCurriculumSettings(repository, req.schoolId);
        const created = await repository.createCurriculumMap(buildVersionPayload({ sourceMap, req, settings }));
        const map = await repository.findCurriculumMapById(created._id);
        return hydrateMapForResponse({ map, settings });
    },

    async cloneCurriculumMapToYear({ req }) {
        assertCondition(canEditCurriculumMap(req.user), 403, 'Not authorized to clone curriculum maps');
        const sourceMap = await repository.findCurriculumMapById(req.params.mapId);
        assertCondition(sourceMap, 404, 'Curriculum map not found');
        assertCondition(isDepartmentAllowed(req.departmentId, sourceMap.department), 403, 'Map outside your department scope');

        const existing = await repository.findCurrentCurriculumMapByScope({
            schoolId: req.schoolId,
            academicYear: req.body.targetAcademicYear,
            ...toMapScope(sourceMap)
        });
        assertCondition(!existing, 409, 'Target year already has a current map for this class and subject');

        const settings = await getCurriculumSettings(repository, req.schoolId);
        const clone = await repository.createCurriculumMap(buildClonePayload({ sourceMap, req, settings }));
        const map = await repository.findCurriculumMapById(clone._id);
        return hydrateMapForResponse({ map, settings });
    },

    async exportCurriculumMap({ req }) {
        assertCondition(canExportCurriculumMap(req.user), 403, 'Not authorized to export curriculum maps');
        const map = await this.getCurriculumMapById({ req });
        const settings = await getCurriculumSettings(repository, req.schoolId);
        const format = req.query.format || 'csv';
        assertExportAllowed({ settings, format });
        const file = buildMapExportFile({ exportService, map, settings, format });
        assertCondition(Boolean(file), 400, 'Unsupported export format');
        return file;
    }
});
};

export const curriculumMapService = createCurriculumMapService();
