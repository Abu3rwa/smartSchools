import logger from '../utils/logger.js';
import { getAiUsageContext } from '../utils/aiUsageContext.js';
import { assertHasCredit, isBillableRole, isCreditError, recordUsage } from './aiCreditService.js';

/**
 * Who pays for this AI call: an explicit `options.usage` object wins, otherwise
 * the request context opened by `protect`. A call with neither is not metered
 * (background jobs, scripts, tests).
 */
const targetFor = (options) => {
    const explicit = options?.usage;
    if (explicit === false) return null;
    const merged = {
        ...(getAiUsageContext() || {}),
        ...(explicit && typeof explicit === 'object' ? explicit : {})
    };
    if (!merged.schoolId || !merged.userId) return null;
    // A caller that names an account but no role is a staff flow; request
    // contexts always carry a role, so students still land on the unbilled path.
    const known = merged.billable ?? (
        merged.role || merged.roles?.length ? isBillableRole(merged) : true
    );
    return { ...merged, billable: known };
};

/**
 * Gate before the provider call. Credit errors block the call so a zero balance
 * cannot run AI for free; an infrastructure failure only logs, because a ledger
 * outage must not take every AI feature down with it.
 */
export const assertAiCredit = async (options) => {
    const target = targetFor(options);
    if (!target?.billable) return;
    try {
        await assertHasCredit({ schoolId: target.schoolId, userId: target.userId });
    } catch (error) {
        if (isCreditError(error)) throw error;
        logger.warn('ai_credit_gate_failed_open', {
            feature: target.feature,
            error: error?.message
        });
    }
};

/** Ledger row for a finished reply. Never throws: the answer is already produced. */
export const meterAiCall = async ({ options, reply }) => {
    const target = targetFor(options);
    if (!target) return null;
    try {
        return await recordUsage({
            schoolId: target.schoolId,
            userId: target.userId,
            reply,
            feature: target.feature || 'general',
            refs: target.refs || {},
            billable: target.billable
        });
    } catch (error) {
        logger.warn('ai_usage_meter_failed', {
            feature: target.feature,
            error: error?.message
        });
        return null;
    }
};
