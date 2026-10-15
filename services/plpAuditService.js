import PlpAuditLog from '../models/PlpAuditLog.js';
import logger from '../utils/logger.js';

export const createPlpAuditWriter = ({ create, log }) => async ({
    school,
    actor,
    action,
    targetType,
    targetId,
    meta = {},
    session = null,
}) => {
    try {
        const [entry] = await create(
            [{ school, actor, action, targetType, targetId, meta }],
            session ? { session } : {}
        );
        return entry;
    } catch (error) {
        log('PLP audit write failed', {
            action,
            targetType,
            targetId: targetId ? String(targetId) : null,
            error: error.message,
        });
        throw error;
    }
};

export const writePlpAudit = createPlpAuditWriter({
    create: PlpAuditLog.create.bind(PlpAuditLog),
    log: logger.error.bind(logger),
});
