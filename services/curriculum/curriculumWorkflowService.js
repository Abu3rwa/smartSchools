import { assertCondition } from './curriculumErrors.js';
import { buildAuditEntry } from './curriculumUtils.js';

const has = (list = [], value) => list.includes(value);

const allowedTransitions = ({ approvalRequired }) => ({
    submit: ['draft', 'revision_requested', 'rejected'],
    start_review: ['submitted'],
    request_revision: ['submitted', 'in_review'],
    approve: ['submitted', 'in_review'],
    reject: ['submitted', 'in_review'],
    publish: approvalRequired ? ['approved'] : ['draft', 'submitted', 'in_review', 'approved'],
    return_to_draft: ['revision_requested', 'rejected', 'submitted']
});

const mapActionToStatus = ({ action, currentStatus, approvalRequired }) => {
    if (action === 'submit') return 'submitted';
    if (action === 'start_review') return 'in_review';
    if (action === 'request_revision') return 'revision_requested';
    if (action === 'approve') return 'approved';
    if (action === 'reject') return 'rejected';
    if (action === 'publish') return 'published';
    if (action === 'return_to_draft') return 'draft';
    return currentStatus;
};

export const resolveWorkflowPolicy = (settings = {}, template = null) => {
    const templateWorkflow = template?.workflow || {};
    const schoolWorkflow = settings?.workflow || {};
    return {
        reviewEnabled: templateWorkflow.reviewEnabled ?? schoolWorkflow.reviewEnabled ?? true,
        approvalRequired: templateWorkflow.approvalRequired ?? schoolWorkflow.approvalRequired ?? true,
        allowDirectPublishWhenApprovalDisabled: schoolWorkflow.allowDirectPublishWhenApprovalDisabled ?? true
    };
};

export const ensureWorkflowActionAllowed = ({ action, currentStatus, policy }) => {
    const transitions = allowedTransitions({ approvalRequired: policy.approvalRequired });
    const allowed = transitions[action] || [];
    assertCondition(has(allowed, currentStatus), 409, `Action "${action}" not allowed from status "${currentStatus}"`);
};

export const applyWorkflowAction = ({ map, action, actorId, note = '', policy }) => {
    ensureWorkflowActionAllowed({
        action,
        currentStatus: map.status,
        policy
    });

    const previousStatus = map.status;
    const nextStatus = mapActionToStatus({
        action,
        currentStatus: map.status,
        approvalRequired: policy.approvalRequired
    });

    if (!map.workflow) map.workflow = {};
    const now = new Date();
    map.status = nextStatus;
    map.workflow.currentState = nextStatus;
    map.updatedBy = actorId;

    if (action === 'submit') {
        map.workflow.submittedBy = actorId;
        map.workflow.submittedAt = now;
    }
    if (action === 'start_review') {
        map.workflow.reviewedBy = actorId;
        map.workflow.reviewedAt = now;
    }
    if (action === 'request_revision') {
        map.workflow.reviewedBy = actorId;
        map.workflow.reviewedAt = now;
        map.workflow.reviewDecision = 'changes_requested';
        map.workflow.reviewNote = note || '';
    }
    if (action === 'approve') {
        map.workflow.reviewedBy = actorId;
        map.workflow.reviewedAt = now;
        map.workflow.reviewDecision = 'approved';
        map.workflow.reviewNote = note || '';
        map.workflow.approvedBy = actorId;
        map.workflow.approvedAt = now;
    }
    if (action === 'reject') {
        map.workflow.reviewedBy = actorId;
        map.workflow.reviewedAt = now;
        map.workflow.reviewDecision = 'rejected';
        map.workflow.reviewNote = note || '';
        map.workflow.rejectedBy = actorId;
        map.workflow.rejectedAt = now;
    }
    if (action === 'publish') {
        map.workflow.publishedBy = actorId;
        map.workflow.publishedAt = now;
    }

    if (!Array.isArray(map.workflowHistory)) map.workflowHistory = [];
    if (!Array.isArray(map.auditTrail)) map.auditTrail = [];

    map.workflowHistory.push(buildAuditEntry({
        action: `workflow_${action}`,
        actor: actorId,
        message: `Status changed from ${previousStatus} to ${nextStatus}`,
        meta: { from: previousStatus, to: nextStatus, action }
    }));
    map.auditTrail.push(buildAuditEntry({
        action: action === 'request_revision' ? 'revision_requested' : action,
        actor: actorId,
        message: note || `Workflow action: ${action}`,
        meta: { from: previousStatus, to: nextStatus }
    }));

    return map;
};
