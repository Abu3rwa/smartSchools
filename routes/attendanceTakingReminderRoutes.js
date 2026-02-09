import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { runReminderJob, getReminders } from '../controllers/attendanceTakingReminderController.js';

const router = express.Router();

router.use(protect);

/** Run the reminder job (classes that ended ~1h ago, no attendance → send email). Admin only. */
router.post('/run', (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
}, runReminderJob);

/** List reminders (with optional filters). Admin only, school-scoped. */
router.get('/', authorize('admin', 'super_admin'), requireSchoolContext, getReminders);

export default router;
