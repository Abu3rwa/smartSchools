import logger from '../utils/logger.js';
import { scheduleForDecayScan, expireStaleReviewTasks } from '../services/reviewSchedulerService.js';
import MasteryRecord from '../models/MasteryRecord.js';

export async function runReviewSchedulerJob({ schoolId = null } = {}) {
  try {
    let schoolsToProcess = [];

    if (schoolId) {
      schoolsToProcess = [schoolId];
    } else {
      schoolsToProcess = await MasteryRecord.distinct('school', {
        school: { $exists: true, $ne: null },
        isMastered: true,
        needsReview: true,
      });
    }

    let tasksCreated = 0;
    for (const scopedSchoolId of schoolsToProcess) {
      const decay = await scheduleForDecayScan({ schoolId: scopedSchoolId });
      tasksCreated += decay?.created || 0;
    }

    const expired = await expireStaleReviewTasks({ beforeDate: new Date() });

    logger.info('review_scheduler_job_completed', {
      schoolId: schoolId || null,
      schoolsProcessed: schoolsToProcess.length,
      tasksCreated,
      tasksExpired: expired?.modifiedCount || 0,
    });

    return {
      schoolsProcessed: schoolsToProcess.length,
      tasksCreated,
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
