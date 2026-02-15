import SubstitutionRequest from '../models/SubstitutionRequest.js';
import logger from '../utils/logger.js';

/**
 * Expire stale SUBMITTED requests (expiresAt passed).
 * Run as a scheduled job to keep status consistent without relying on read path.
 */
export async function expireStaleSubstitutionRequests() {
    const result = await SubstitutionRequest.updateMany(
        { status: 'SUBMITTED', expiresAt: { $lt: new Date() } },
        {
            $set: { status: 'EXPIRED' },
            $push: {
                timeline: {
                    action: 'EXPIRED',
                    by: null,
                    at: new Date(),
                    meta: { reason: 'Token expired (scheduled job)' }
                }
            }
        }
    ).setOptions({ skipTenantFilter: true });

    if (result.modifiedCount > 0) {
        logger.info(`Substitution expiry job: marked ${result.modifiedCount} request(s) as EXPIRED`);
    }
    return result.modifiedCount;
}
