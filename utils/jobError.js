import logger from './logger.js';
import { isDbUnavailable, shouldLogDbOutage } from './dbHealth.js';

/**
 * Scheduler catches used to log every failed tick at ERROR level, which turned
 * one connectivity outage into a wall of identical tracebacks. A database
 * outage is reported once per window; real job failures keep their ERROR line.
 */
export const reportJobError = (label, error) => {
    if (isDbUnavailable(error)) {
        if (shouldLogDbOutage()) {
            logger.warn(`${label}: database unreachable; the job retries on its next cycle.`);
        }
        return;
    }
    logger.error(`${label}:`, error?.message || error);
};

export default reportJobError;
