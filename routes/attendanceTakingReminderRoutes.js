import express from 'express';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { runReminderJob, getReminders } from '../controllers/attendanceReminderController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);

/** Run the reminder job manually (admin only). */
router.post('/run', authorize('admin'), runReminderJob);

/** List reminder history (admin only). */
router.get('/', authorize('admin'), getReminders);

export default router;
