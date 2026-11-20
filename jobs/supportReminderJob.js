import { runSupportReminderJob } from '../services/supportReminderService.js';
import { reportJobError } from '../utils/jobError.js';

/**
 * One bounded sweep for support reminders and staff escalations. It never
 * creates a survey or a plan; it only nudges what a school already issued.
 */
export const runSupportReminderSweep = async ({ now = new Date() } = {}) => {
    try {
        return await runSupportReminderJob({ now });
    } catch (error) {
        reportJobError('support_reminder_job_error', error);
        return { schools: 0, processed: 0, sent: 0, failed: 0, escalated: 0, skipped: 0, error: error?.message };
    }
};

export default runSupportReminderSweep;
