import { PERMISSIONS } from '../../config/permissions.js';
import { assertCondition } from './curriculumErrors.js';
import { curriculumNotificationService } from './curriculumNotificationService.js';
import { curriculumRepository } from './curriculumRepository.js';
import {
    canApproveOverride,
    canSubmitOverride
} from './curriculumAccessService.js';
import {
    buildPaginationResult,
    ensurePagination,
    isDepartmentAllowed,
    toObjectIdString
} from './curriculumUtils.js';

const findEntryById = (guide, entryId) => (
    (guide.entries || []).find((entry) => toObjectIdString(entry._id) === toObjectIdString(entryId))
);

const assertTeacherScopeForGuide = async (repository, req, guide) => {
    if (req.user.role !== 'teacher') return;
    const scope = await repository.getTeacherScope({ schoolId: req.schoolId, userId: req.user._id });
    const classAllowed = scope.classIds.includes(toObjectIdString(guide.classId?._id || guide.classId));
    const subjectAllowed = scope.subjectIds.includes(toObjectIdString(guide.subject?._id || guide.subject));
    assertCondition(classAllowed && subjectAllowed, 403, 'You can only request overrides for assigned classes and subjects');
};

const notifyOverrideApprovers = async ({ repository, notificationService, req, guide, overrideId }) => {
    const approvers = await repository.listApprovers({
        schoolId: req.schoolId,
        departmentId: guide.department || req.departmentId || null,
        permission: PERMISSIONS.APPROVE_PACING_OVERRIDES
    });
    await notificationService.notifyUsers({
        schoolId: req.schoolId,
        userIds: approvers.map((user) => user._id),
        subject: 'New pacing override request',
        message: `An override request was submitted for guide "${guide.title}".`,
        actorId: req.user._id,
        metadata: { overrideId: String(overrideId), guideId: String(guide._id), event: 'pacing_override_submitted' }
    });
};

// eslint-disable-next-line max-lines-per-function
export const createPacingOverrideService = ({
    repository = curriculumRepository,
    notificationService = curriculumNotificationService
} = {}) => ({
    async createOverrideRequest({ req }) {
        assertCondition(canSubmitOverride(req.user), 403, 'Not authorized to submit override requests');
        const guide = await repository.findPacingGuideById(req.body.pacingGuideId);
        assertCondition(guide, 404, 'Pacing guide not found');
        assertCondition(guide.status === 'published', 409, 'Override requests require a published pacing guide');
        assertCondition(isDepartmentAllowed(req.departmentId, guide.department), 403, 'Guide outside your department scope');
        assertCondition(guide.overridePolicy?.allowTeacherOverride !== false, 403, 'Teacher overrides are disabled for this guide');

        const entry = findEntryById(guide, req.body.pacingEntryId);
        assertCondition(entry, 404, 'Pacing entry not found');
        await assertTeacherScopeForGuide(repository, req, guide);

        const created = await repository.createOverrideRequest({
            school: req.schoolId,
            academicYear: guide.academicYear,
            classId: guide.classId?._id || guide.classId,
            subject: guide.subject?._id || guide.subject,
            pacingGuide: guide._id,
            pacingEntryId: req.body.pacingEntryId,
            requestedBy: req.user._id,
            reason: req.body.reason,
            requestPayload: req.body.requestPayload
        });

        await notifyOverrideApprovers({
            repository,
            notificationService,
            req,
            guide,
            overrideId: created._id
        });

        return repository.findOverrideRequestById(created._id);
    },

    async listOverrideRequests({ req }) {
        assertCondition(canApproveOverride(req.user) || req.user.role === 'teacher', 403, 'Not authorized to view override requests');
        const pagination = ensurePagination(req.query);
        const query = {};
        if (req.query.status) query.status = req.query.status;
        if (req.query.classId) query.classId = req.query.classId;
        if (req.query.subjectId) query.subject = req.query.subjectId;
        if (!canApproveOverride(req.user)) {
            query.requestedBy = req.user._id;
        }

        const [items, total] = await Promise.all([
            repository.listOverrideRequests(query, pagination),
            repository.countOverrideRequests(query)
        ]);

        return {
            items,
            pagination: buildPaginationResult({ page: pagination.page, limit: pagination.limit, total })
        };
    },

    async approveOverrideRequest({ req }) {
        assertCondition(canApproveOverride(req.user), 403, 'Not authorized to approve override requests');
        const overrideRequest = await repository.findOverrideRequestById(req.params.overrideId);
        assertCondition(overrideRequest, 404, 'Override request not found');
        assertCondition(overrideRequest.status === 'pending', 409, 'Override request has already been processed');

        const guide = await repository.findPacingGuideById(overrideRequest.pacingGuide?._id || overrideRequest.pacingGuide);
        assertCondition(guide, 404, 'Linked pacing guide not found');
        assertCondition(isDepartmentAllowed(req.departmentId, guide.department), 403, 'Guide outside your department scope');

        const entry = findEntryById(guide, overrideRequest.pacingEntryId);
        assertCondition(entry, 404, 'Pacing entry no longer exists');
        entry.focus = overrideRequest.requestPayload.focus || '';
        entry.objectives = overrideRequest.requestPayload.objectives || [];
        entry.assessment = overrideRequest.requestPayload.assessment || '';
        entry.notes = overrideRequest.requestPayload.notes || '';
        guide.updatedBy = req.user._id;
        guide.syncStatus = guide.syncStatus === 'out_of_sync' ? 'reconciled' : guide.syncStatus;
        await repository.savePacingGuide(guide);

        overrideRequest.status = 'approved';
        overrideRequest.decision.reviewedBy = req.user._id;
        overrideRequest.decision.reviewedAt = new Date();
        overrideRequest.decision.note = req.body.note || '';
        await repository.saveOverrideRequest(overrideRequest);

        await notificationService.notifyUsers({
            schoolId: req.schoolId,
            userIds: [overrideRequest.requestedBy],
            subject: 'Pacing override approved',
            message: `Your pacing override request was approved${req.body.note ? `: ${req.body.note}` : '.'}`,
            actorId: req.user._id,
            metadata: { overrideId: String(overrideRequest._id), event: 'pacing_override_approved' }
        });

        return repository.findOverrideRequestById(overrideRequest._id);
    },

    async rejectOverrideRequest({ req }) {
        assertCondition(canApproveOverride(req.user), 403, 'Not authorized to reject override requests');
        const overrideRequest = await repository.findOverrideRequestById(req.params.overrideId);
        assertCondition(overrideRequest, 404, 'Override request not found');
        assertCondition(overrideRequest.status === 'pending', 409, 'Override request has already been processed');

        overrideRequest.status = 'rejected';
        overrideRequest.decision.reviewedBy = req.user._id;
        overrideRequest.decision.reviewedAt = new Date();
        overrideRequest.decision.note = req.body.note || '';
        await repository.saveOverrideRequest(overrideRequest);

        await notificationService.notifyUsers({
            schoolId: req.schoolId,
            userIds: [overrideRequest.requestedBy],
            subject: 'Pacing override rejected',
            message: `Your pacing override request was rejected${req.body.note ? `: ${req.body.note}` : '.'}`,
            actorId: req.user._id,
            metadata: { overrideId: String(overrideRequest._id), event: 'pacing_override_rejected' }
        });

        return repository.findOverrideRequestById(overrideRequest._id);
    }
});

export const pacingOverrideService = createPacingOverrideService();
