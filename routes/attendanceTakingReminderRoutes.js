import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { runReminderJob, getReminders } from '../controllers/attendanceTakingReminderController.js';

const router = express.Router();

router.use(protect);

/** 
 * Run the reminder job manually with custom time window. Admin only.
 * Query/Body params:
 *   - hours: Number of hours after class end (default: 10)
 *            Examples: 1, 1.5, 2, 10
 * 
 * Usage:
 *   POST /api/attendance-taking-reminders/run?hours=1
 *   POST /api/attendance-taking-reminders/run?hours=1.5
 */
router.post('/run', (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
}, runReminderJob);

/** List reminders (with optional filters). Admin/Department Principal, school-scoped. */
router.get('/', authorize('admin', 'super_admin', 'department_principal'), requireSchoolContext, getReminders);

export default router;
