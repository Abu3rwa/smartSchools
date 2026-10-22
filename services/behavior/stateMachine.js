import { BEHAVIOR_TRANSITIONS } from '../../constants/behavior.js';
import { recordBehaviorAudit } from './auditService.js';

export class BehaviorTransitionError extends Error {
    constructor(from, to) {
        super(`Cannot move a behavior incident from ${from} to ${to}`);
        this.statusCode = 400;
        this.code = 'INVALID_TRANSITION';
        this.from = from;
        this.to = to;
    }
}

export const canTransitionBehavior = (from, to) => (BEHAVIOR_TRANSITIONS[from] || []).includes(to);

/**
 * The only place a behavior incident status changes. Illegal hops are refused,
 * every accepted hop is saved and audited with before/after values.
 */
export const applyBehaviorTransition = async ({
    incident,
    to,
    actor = null,
    patch = null,
    reason = null,
    meta = null,
    auditAction = null
}) => {
    const from = incident.status;
    if (from === to) return incident;
    if (!canTransitionBehavior(from, to)) throw new BehaviorTransitionError(from, to);

    if (patch) {
        Object.entries(patch).forEach(([key, value]) => {
            incident.set(key, value);
        });
    }

    incident.status = to;
    if (to === 'closed' && !incident.closedAt) incident.closedAt = new Date();
    await incident.save();

    await recordBehaviorAudit({
        schoolId: incident.school,
        action: auditAction || `status_${to}`,
        actor,
        incidentId: incident._id,
        before: { status: from },
        after: { status: to, ...(patch || {}) },
        meta: reason ? { reason } : meta
    });

    return incident;
};
