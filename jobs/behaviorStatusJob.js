import BehaviorSettings from '../models/BehaviorSettings.js';
import BehaviorIncident from '../models/BehaviorIncident.js';
import { markOverdueBehaviorTasks } from '../services/behavior/taskService.js';
import { deliverBehaviorEmails, loadDeliverySchool } from '../services/behavior/emailDeliveryService.js';
import { recordBehaviorAudit, BEHAVIOR_AUDIT_ACTIONS } from '../services/behavior/auditService.js';
import logger from '../utils/logger.js';

const HOUR_MS = 60 * 60 * 1000;

const hoursBetween = (value, fallback) => {
    const hours = Number(value);
    return Number.isFinite(hours) && hours > 0 ? hours : fallback;
};

/**
 * Schools that switched the module on. Disabled schools are never touched, which
 * is what keeps the flag honest: no background work runs behind an off switch.
 */
const enabledSchools = async () => {
    const rows = await BehaviorSettings.find({ enabled: true })
        .select('school approval counting emailDelivery sendDelayMinutes')
        .lean()
        .setOptions({ skipTenantFilter: true });
    return rows.filter((row) => row?.school);
};

const escalateApprovals = async ({ schoolId, settings, now }) => {
    const escalateAfterMs = hoursBetween(settings?.approval?.escalationAfterHours, 48) * HOUR_MS;
    const remindAfterMs = hoursBetween(settings?.approval?.reminderIntervalHours, 24) * HOUR_MS;
    const cutoff = new Date(now.getTime() - escalateAfterMs);
    const reminderCutoff = new Date(now.getTime() - remindAfterMs);

    const pendingMatch = {
        school: schoolId,
        status: 'pending_approval',
        'approval.requestedAt': { $ne: null, $lte: cutoff }
    };

    const escalated = await BehaviorIncident.updateMany(
        { ...pendingMatch, 'approval.escalatedAt': null },
        { $set: { 'approval.escalatedAt': now } }
    );
    // A reminder is a queue entry for the approver, not a message to a family.
    // Even with email delivery switched on, an approval that times out only ever
    // becomes more visible; nothing is auto-released.
    const reminded = await BehaviorIncident.updateMany(
        {
            ...pendingMatch,
            $or: [
                { 'approval.remindedAt': null },
                { 'approval.remindedAt': { $lte: reminderCutoff } }
            ]
        },
        { $set: { 'approval.remindedAt': now } }
    );

    if (escalated.modifiedCount) {
        await recordBehaviorAudit({
            schoolId,
            action: BEHAVIOR_AUDIT_ACTIONS.APPROVAL_ESCALATED,
            after: { incidents: escalated.modifiedCount }
        });
    }

    return {
        escalated: escalated.modifiedCount || 0,
        remindersMarked: reminded.modifiedCount || 0
    };
};

export const runBehaviorStatusJob = async ({ now = new Date() } = {}) => {
    const schools = await enabledSchools();
    const summary = {
        schools: schools.length,
        overdueMarked: 0,
        escalated: 0,
        remindersMarked: 0,
        emailSent: 0,
        emailFailed: 0,
        emailQueued: 0,
        errors: []
    };

    for (const settings of schools) {
        const schoolId = settings.school;
        try {
            const overdue = await markOverdueBehaviorTasks({ schoolId, now });
            const approvals = await escalateApprovals({ schoolId, settings, now });
            // A held draft becomes due here: the release only set readyAt.
            const wantsEmail = settings.emailDelivery?.enabled === true;
            const school = wantsEmail ? await loadDeliverySchool(schoolId) : null;
            const delivery = await deliverBehaviorEmails({ schoolId, settings, school, now });
            summary.overdueMarked += overdue.marked;
            summary.escalated += approvals.escalated;
            summary.remindersMarked += approvals.remindersMarked;
            summary.emailSent += delivery.sent;
            summary.emailFailed += delivery.failed;
            summary.emailQueued += delivery.dryRun ? delivery.due : 0;
        } catch (error) {
            // One bad school must not stop the sweep for everyone else.
            summary.errors.push({ schoolId: String(schoolId), message: error?.message });
        }
    }

    if (summary.errors.length) {
        logger.warn('behavior_status_job_errors', { count: summary.errors.length });
    }

    return summary;
};

export default runBehaviorStatusJob;
