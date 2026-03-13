import { PERMISSIONS } from '../../config/permissions.js';
import { curriculumExportService } from './curriculumExportService.js';
import { assertCondition, createHttpError } from './curriculumErrors.js';
import { curriculumNotificationService } from './curriculumNotificationService.js';
import { curriculumRepository } from './curriculumRepository.js';
import {
    canEditPacingGuide,
    canPublishPacingGuide,
    canReviewPacingGuide,
    canViewPacingGuide
} from './curriculumAccessService.js';
import {
    buildAuditEntry,
    buildPaginationResult,
    ensurePagination,
    isDepartmentAllowed,
    sortByWeek,
    toObjectIdString
} from './curriculumUtils.js';
import {
    buildEntriesFromMapUnits,
    buildTeacherFilter,
    ensureTeacherGuideScope,
    reconcileEntriesWithMap
} from './pacingGuideServiceHelpers.js';

const toComparableTime = (value) => new Date(value).getTime();

// eslint-disable-next-line max-lines-per-function
export const createPacingGuideService = ({
    repository = curriculumRepository,
    notificationService = curriculumNotificationService,
    exportService = curriculumExportService
} = {}) => ({
    async createPacingGuide({ req }) {
        assertCondition(canEditPacingGuide(req.user), 403, 'Not authorized to create pacing guides');
        const map = await repository.findCurriculumMapById(req.body.mapId);
        assertCondition(map, 404, 'Curriculum map not found');
        assertCondition(isDepartmentAllowed(req.departmentId, map.department), 403, 'Map outside your department scope');
        assertCondition(toObjectIdString(map.classId?._id || map.classId) === toObjectIdString(req.body.classId), 400, 'Guide class must match map class');

        const classDoc = await repository.findClassById(req.body.classId);
        assertCondition(classDoc, 404, 'Class not found');
        assertCondition(isDepartmentAllowed(req.departmentId, classDoc.department), 403, 'Class outside your department scope');

        const entries = buildEntriesFromMapUnits(map, req.body.includeWeeks || []);
        const payload = {
            school: req.schoolId,
            academicYear: map.academicYear,
            grade: map.grade,
            subject: map.subject?._id || map.subject,
            classId: req.body.classId,
            department: classDoc.department || map.department || null,
            term: req.body.term,
            title: req.body.title || `${map.title} - ${req.body.term}`,
            status: 'draft',
            syncStatus: 'in_sync',
            mapRef: {
                mapId: map._id,
                mapVersion: map.version
            },
            entries,
            overridePolicy: {
                allowTeacherOverride: true,
                requireApproval: true
            },
            createdBy: req.user._id,
            updatedBy: req.user._id,
            auditTrail: [buildAuditEntry({ action: 'created', actor: req.user._id, message: 'Pacing guide created from map template' })]
        };
        const created = await repository.createPacingGuide(payload);
        return repository.findPacingGuideById(created._id);
    },

    async listPacingGuides({ req }) {
        assertCondition(canViewPacingGuide(req.user), 403, 'Not authorized to view pacing guides');
        const pagination = ensurePagination(req.query);
        const query = {};
        if (req.query.academicYear) query.academicYear = req.query.academicYear;
        if (req.query.classId) query.classId = req.query.classId;
        if (req.query.subjectId) query.subject = req.query.subjectId;
        if (req.query.status) query.status = req.query.status;
        if (req.query.syncStatus) query.syncStatus = req.query.syncStatus;
        if (req.query.term) query.term = req.query.term;
        if (req.departmentId) query.department = req.departmentId;

        if (req.user.role === 'teacher' && !canEditPacingGuide(req.user)) {
            Object.assign(query, await buildTeacherFilter({ repository, req }));
        }

        const [items, total] = await Promise.all([
            repository.listPacingGuides(query, pagination),
            repository.countPacingGuides(query)
        ]);
        return {
            items,
            pagination: buildPaginationResult({ page: pagination.page, limit: pagination.limit, total })
        };
    },

    async getPacingGuideById({ req }) {
        assertCondition(canViewPacingGuide(req.user), 403, 'Not authorized to view pacing guides');
        const guide = await repository.findPacingGuideById(req.params.guideId);
        assertCondition(guide, 404, 'Pacing guide not found');
        assertCondition(isDepartmentAllowed(req.departmentId, guide.department), 403, 'Guide outside your department scope');
        await ensureTeacherGuideScope({ repository, req, guide });

        if (req.user.role === 'teacher' && !canEditPacingGuide(req.user)) {
            assertCondition(guide.status === 'published', 403, 'Teachers can view only published guides');
        }

        return guide;
    },

    async updatePacingGuide({ req }) {
        assertCondition(canEditPacingGuide(req.user), 403, 'Not authorized to update pacing guides');
        const guide = await repository.findPacingGuideById(req.params.guideId);
        assertCondition(guide, 404, 'Pacing guide not found');
        assertCondition(isDepartmentAllowed(req.departmentId, guide.department), 403, 'Guide outside your department scope');
        assertCondition(guide.status === 'draft', 409, 'Only draft guides can be edited directly');

        if (req.body.expectedUpdatedAt) {
            const expected = toComparableTime(req.body.expectedUpdatedAt);
            const actual = toComparableTime(guide.updatedAt);
            assertCondition(expected === actual, 409, 'Guide has changed since last fetch', { code: 'VERSION_CONFLICT' });
        }

        if (req.body.title !== undefined) guide.title = req.body.title;
        if (req.body.entries !== undefined) guide.entries = sortByWeek(req.body.entries);
        guide.updatedBy = req.user._id;
        guide.auditTrail.push(buildAuditEntry({ action: 'updated', actor: req.user._id, message: 'Draft pacing guide updated' }));
        await repository.savePacingGuide(guide);
        return repository.findPacingGuideById(guide._id);
    },

    async submitPacingGuideForReview({ req }) {
        assertCondition(canEditPacingGuide(req.user), 403, 'Not authorized to submit pacing guides');
        const guide = await repository.findPacingGuideById(req.params.guideId);
        assertCondition(guide, 404, 'Pacing guide not found');
        assertCondition(isDepartmentAllowed(req.departmentId, guide.department), 403, 'Guide outside your department scope');
        assertCondition(guide.status === 'draft', 409, 'Only draft guides can be submitted');

        guide.status = 'in_review';
        guide.workflow.submittedBy = req.user._id;
        guide.workflow.submittedAt = new Date();
        guide.updatedBy = req.user._id;
        guide.auditTrail.push(buildAuditEntry({ action: 'submitted', actor: req.user._id, message: 'Submitted pacing guide for review' }));
        await repository.savePacingGuide(guide);

        const approvers = await repository.listApprovers({
            schoolId: req.schoolId,
            departmentId: guide.department || req.departmentId || null,
            permission: PERMISSIONS.REVIEW_PACING_GUIDES
        });
        await notificationService.notifyUsers({
            schoolId: req.schoolId,
            userIds: approvers.map((user) => user._id),
            subject: `Pacing guide submitted: ${guide.title}`,
            message: 'A pacing guide is waiting for review.',
            actorId: req.user._id,
            metadata: { guideId: String(guide._id), event: 'pacing_guide_submitted' }
        });
        return repository.findPacingGuideById(guide._id);
    },

    async reviewPacingGuide({ req }) {
        assertCondition(canReviewPacingGuide(req.user), 403, 'Not authorized to review pacing guides');
        const guide = await repository.findPacingGuideById(req.params.guideId);
        assertCondition(guide, 404, 'Pacing guide not found');
        assertCondition(isDepartmentAllowed(req.departmentId, guide.department), 403, 'Guide outside your department scope');
        assertCondition(guide.status === 'in_review', 409, 'Only guides in review can be reviewed');

        guide.workflow.reviewedBy = req.user._id;
        guide.workflow.reviewedAt = new Date();
        guide.workflow.reviewDecision = req.body.decision;
        guide.workflow.reviewNote = req.body.note || '';
        guide.status = req.body.decision === 'approved' ? 'in_review' : 'draft';
        guide.updatedBy = req.user._id;
        guide.auditTrail.push(buildAuditEntry({
            action: 'reviewed',
            actor: req.user._id,
            message: `Review decision: ${req.body.decision}`
        }));
        await repository.savePacingGuide(guide);

        await notificationService.notifyUsers({
            schoolId: req.schoolId,
            userIds: [guide.createdBy],
            subject: `Pacing guide review update: ${guide.title}`,
            message: `Review decision: ${req.body.decision}${req.body.note ? ` - ${req.body.note}` : ''}`,
            actorId: req.user._id,
            metadata: { guideId: String(guide._id), event: 'pacing_guide_reviewed', decision: req.body.decision }
        });
        return repository.findPacingGuideById(guide._id);
    },

    async publishPacingGuide({ req }) {
        assertCondition(canPublishPacingGuide(req.user), 403, 'Not authorized to publish pacing guides');
        const guide = await repository.findPacingGuideById(req.params.guideId);
        assertCondition(guide, 404, 'Pacing guide not found');
        assertCondition(isDepartmentAllowed(req.departmentId, guide.department), 403, 'Guide outside your department scope');
        assertCondition(guide.status === 'in_review', 409, 'Only guides in review can be published');
        assertCondition(guide.workflow.reviewDecision === 'approved', 409, 'Guide must be approved before publish');

        guide.status = 'published';
        guide.workflow.publishedBy = req.user._id;
        guide.workflow.publishedAt = new Date();
        guide.syncStatus = 'in_sync';
        guide.updatedBy = req.user._id;
        guide.auditTrail.push(buildAuditEntry({ action: 'published', actor: req.user._id, message: 'Published pacing guide' }));
        await repository.savePacingGuide(guide);
        return repository.findPacingGuideById(guide._id);
    },

    async reconcilePacingGuide({ req }) {
        assertCondition(canEditPacingGuide(req.user), 403, 'Not authorized to reconcile pacing guides');
        const guide = await repository.findPacingGuideById(req.params.guideId);
        assertCondition(guide, 404, 'Pacing guide not found');
        assertCondition(isDepartmentAllowed(req.departmentId, guide.department), 403, 'Guide outside your department scope');

        const currentMap = await repository.findCurrentCurriculumMapByScope({
            schoolId: req.schoolId,
            academicYear: guide.academicYear,
            classId: guide.classId?._id || guide.classId,
            subjectId: guide.subject?._id || guide.subject
        });
        assertCondition(currentMap, 404, 'Current curriculum map not found');

        if (req.body.strategy === 'apply_map_diff') {
            const reconciled = reconcileEntriesWithMap({ currentMap, guideEntries: guide.entries });
            guide.entries = sortByWeek(reconciled);
        }

        guide.mapRef.mapId = currentMap._id;
        guide.mapRef.mapVersion = currentMap.version;
        guide.syncStatus = 'reconciled';
        guide.updatedBy = req.user._id;
        guide.auditTrail.push(buildAuditEntry({
            action: 'reconciled',
            actor: req.user._id,
            message: `Reconciled with map version ${currentMap.version}`
        }));
        await repository.savePacingGuide(guide);
        return repository.findPacingGuideById(guide._id);
    },

    async exportPacingGuide({ req }) {
        const guide = await this.getPacingGuideById({ req });
        const format = req.query.format || 'csv';
        if (format === 'pdf') {
            return {
                contentType: 'application/pdf',
                filename: `pacing-guide-${guide._id}.pdf`,
                buffer: exportService.exportPacingGuideAsPdf(guide)
            };
        }
        if (format === 'csv') {
            return {
                contentType: 'text/csv; charset=utf-8',
                filename: `pacing-guide-${guide._id}.csv`,
                text: exportService.exportPacingGuideAsCsv(guide)
            };
        }
        throw createHttpError(400, 'Unsupported export format');
    }
});

export const pacingGuideService = createPacingGuideService();
