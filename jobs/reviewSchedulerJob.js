import logger from '../utils/logger.js';
import { scheduleForDecayScan, expireStaleReviewTasks } from '../services/reviewSchedulerService.js';

export async function runReviewSchedulerJob({ schoolId = null } = {}) {
  try {
    const [decay, expired] = await Promise.all([
      scheduleForDecayScan({ schoolId }),
      expireStaleReviewTasks({ beforeDate: new Date() }),
    ]);

    logger.info('review_scheduler_job_completed', {
      schoolId: schoolId || null,
      tasksCreated: decay?.created || 0,
      tasksExpired: expired?.modifiedCount || 0,
    });

    return {
      tasksCreated: decay?.created || 0,
      tasksExpired: expired?.modifiedCount || 0,
    };
  } catch (error) {
    logger.error('review_scheduler_job_failed', {
      schoolId: schoolId || null,
      error: error?.message || String(error),
    });
    throw error;
  }
}
