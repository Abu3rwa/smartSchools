import BehaviorAuditLog from '../../models/BehaviorAuditLog.js';
import logger from '../../utils/logger.js';

export const BEHAVIOR_AUDIT_ACTIONS = {
    INCIDENT_LOGGED: 'incident_logged',
    INCIDENT_CONFIRMED: 'incident_confirmed',
    INCIDENT_STEP_OVERRIDDEN: 'incident_step_overridden',
    INCIDENT_EDITED: 'incident_edited',
    INCIDENT_VOIDED: 'incident_voided',
    INCIDENT_MERGED: 'incident_merged',
    APPROVAL_REQUESTED: 'approval_requested',
    APPROVAL_ESCALATED: 'approval_escalated',
    APPROVAL_REMINDER: 'approval_reminder',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    NOTIFICATION_DRAFTED: 'notification_drafted',
    NOTIFICATION_SENT: 'notification_sent',
    NOTIFICATION_FAILED: 'notification_failed',
    PORTAL_RELEASED: 'portal_released',
    TASK_CREATED: 'task_created',
    TASK_SUBMITTED: 'task_submitted',
    TASK_VERIFIED: 'task_verified',
    TASK_REVISION_REQUESTED: 'task_revision_requested',
    TASK_WAIVED: 'task_waived',
    TASK_OVERDUE: 'task_overdue',
    SETTINGS_CHANGED: 'settings_changed',
    LADDER_CHANGED: 'ladder_changed',
    BEHAVIOR_TYPE_CHANGED: 'behavior_type_changed',
    TEMPLATE_CHANGED: 'template_changed',
    COUNTS_RESET: 'counts_reset'
};

const actorFromUser = (user = null) => (user ? {
    user: user._id,
    role: user.role,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || null
} : {});

/**
 * Inserts an immutable audit entry. Never include parent emails, student names
 * or incident notes in meta - ids only.
 */
export const recordBehaviorAudit = async ({
    schoolId,
    action,
    actor = null,
    incidentId = null,
    targetType = null,
    targetId = null,
    before = null,
    after = null,
    meta = null
}) => {
    try {
        return await BehaviorAuditLog.create({
            school: schoolId,
            incident: incidentId,
            targetType,
            targetId,
            action,
            actor: actorFromUser(actor && actor._id ? actor : null),
            before,
            after,
            meta
        });
    } catch (error) {
        // An audit write must never swallow the incident itself, but a silent
        // audit gap is worse than a loud log line.
        logger.error('behavior_audit_write_failed', {
            schoolId: String(schoolId || ''),
            action,
            code: error?.code,
            message: error?.message
        });
        return null;
    }
};

export const listBehaviorAudit = async ({ schoolId, incidentId, limit = 100 }) => BehaviorAuditLog
    .find({ school: schoolId, incident: incidentId })
    .sort({ createdAt: 1 })
    .limit(Math.min(parseInt(limit, 10) || 100, 500))
    .select('action actor before after meta createdAt')
    .lean();
