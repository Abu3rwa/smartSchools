import { asyncHandler } from '../middleware/errorHandler.js';
import {
    previewBehaviorSuggestion,
    logBehaviorIncident,
    listPendingApprovals,
    decideBehaviorApproval,
    voidBehaviorIncident,
    mergeBehaviorIncidents,
    resetBehaviorCounts
} from '../services/behavior/incidentService.js';
import {
    getBehaviorIncidentBundle,
    listBehaviorIncidents
} from '../services/behavior/adminService.js';
import { getBehaviorSettings } from '../services/behavior/settingsService.js';
import { listBehaviorAudit } from '../services/behavior/auditService.js';
import { getStudentBehaviorTrend } from '../services/behavior/reportService.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const pagination = (req, total) => ({
    limit: Number(req.query.limit) || 50,
    skip: Number(req.query.skip) || 0,
    total
});

/**
 * @desc    Suggested step, occurrence count, duplicate warning and approval rule
 *          for a student + behavior, without writing anything
 * @route   GET /api/behavior/suggestion/preview
 * @access  Private (behavior staff)
 */
export const getBehaviorSuggestionPreview = asyncHandler(async (req, res) => {
    const settings = await getBehaviorSettings(req.schoolId);
    const preview = await previewBehaviorSuggestion({
        req,
        studentId: req.query.studentId,
        behaviorTypeId: req.query.behaviorTypeId,
        occurredAt: req.query.occurredAt,
        settings
    });

    return ok(res, preview);
});

/**
 * @desc    Log an incident; the suggestion engine picks the step and the
 *          consequence becomes tasks, a draft and a portal entry
 * @route   POST /api/behavior/incidents
 * @access  Private (behavior staff)
 */
export const logBehaviorIncidentController = asyncHandler(async (req, res) => {
    const settings = await getBehaviorSettings(req.schoolId);
    const result = await logBehaviorIncident({ req, payload: req.body, settings });

    if (result.merged) {
        return ok(res, {
            merged: true,
            target: result.target,
            source: result.source,
            message: result.message || 'Merged into the existing incident. No new count was added.'
        }, 201);
    }

    return ok(res, {
        incident: result.incident,
        status: result.status,
        approvalRequired: result.approvalRequired,
        taskCount: result.tasks?.length || 0,
        missingParentEmail: result.missingParentEmail === true,
        flagForAdmin: result.flagForAdmin === true
    }, 201);
});

/**
 * @desc    Paged incident list for the workspace
 * @route   GET /api/behavior/incidents
 * @access  Private (behavior staff)
 */
export const getBehaviorIncidents = asyncHandler(async (req, res) => {
    const { items, total } = await listBehaviorIncidents({
        req,
        query: req.query,
        limit: req.query.limit,
        skip: req.query.skip
    });

    return ok(res, { items, pagination: pagination(req, total) });
});

/**
 * @desc    Incident with its tasks, communication state and ladder
 * @route   GET /api/behavior/incidents/:id
 * @access  Private (behavior staff)
 */
export const getBehaviorIncidentById = asyncHandler(async (req, res) => {
    const bundle = await getBehaviorIncidentBundle({ req, incidentId: req.params.id });
    return ok(res, bundle);
});

/**
 * @desc    Full audit trail of one incident
 * @route   GET /api/behavior/incidents/:id/audit
 * @access  Private (behavior staff)
 */
export const getBehaviorIncidentAudit = asyncHandler(async (req, res) => {
    const items = await listBehaviorAudit({
        schoolId: req.schoolId,
        incidentId: req.params.id,
        limit: req.query.limit
    });
    return ok(res, { items });
});

/**
 * @desc    Approve or reject a suggested consequence
 * @route   POST /api/behavior/incidents/:id/approval
 * @access  Private (approver roles from settings)
 */
export const decideBehaviorApprovalController = asyncHandler(async (req, res) => {
    const settings = await getBehaviorSettings(req.schoolId);
    const result = await decideBehaviorApproval({
        req,
        incidentId: req.params.id,
        decision: req.body.decision,
        comment: req.body.comment,
        draftEdits: req.body.draftEdits,
        settings
    });

    return ok(res, {
        incident: result.incident,
        status: result.status,
        taskCount: result.tasks?.length || 0,
        missingParentEmail: result.missingParentEmail === true
    });
});

/**
 * @desc    Void an incident (reason required, count released, tasks waived)
 * @route   POST /api/behavior/incidents/:id/void
 * @access  Private (behavior staff)
 */
export const voidBehaviorIncidentController = asyncHandler(async (req, res) => {
    const incident = await voidBehaviorIncident({
        req,
        incidentId: req.params.id,
        reason: req.body.reason
    });
    return ok(res, { incident });
});

/**
 * @desc    Merge two incidents of the same student and behavior
 * @route   POST /api/behavior/incidents/merge
 * @access  Private (behavior staff)
 */
export const mergeBehaviorIncidentsController = asyncHandler(async (req, res) => {
    const result = await mergeBehaviorIncidents({
        req,
        sourceId: req.body.sourceId || null,
        targetId: req.body.targetId,
        pending: req.body.pending || null
    });
    return ok(res, result);
});

/**
 * @desc    Incidents waiting on an approval decision
 * @route   GET /api/behavior/approvals/pending
 * @access  Private (behavior staff)
 */
export const getPendingBehaviorApprovals = asyncHandler(async (req, res) => {
    const { items, total } = await listPendingApprovals({
        req,
        limit: req.query.limit,
        skip: req.query.skip
    });
    return ok(res, { items, pagination: pagination(req, total) });
});

/**
 * @desc    Restart the counting window for a student without deleting history
 * @route   POST /api/behavior/counts/reset
 * @access  Private (behavior admin)
 */
export const resetBehaviorCountsController = asyncHandler(async (req, res) => {
    const settings = await getBehaviorSettings(req.schoolId);
    const result = await resetBehaviorCounts({
        req,
        studentId: req.body.studentId,
        behaviorTypeId: req.body.behaviorTypeId || null,
        reason: req.body.reason,
        settings
    });

    return ok(res, { reset: result.reset, window: result.window });
});

/**
 * @desc    Escalation history for one student
 * @route   GET /api/behavior/students/:studentId/trend
 * @access  Private (behavior staff)
 */
export const getStudentBehaviorTrendController = asyncHandler(async (req, res) => {
    const trend = await getStudentBehaviorTrend({
        req,
        studentId: req.params.studentId,
        limit: req.query.limit
    });
    return ok(res, trend);
});
