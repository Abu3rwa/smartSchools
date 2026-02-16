import express from 'express';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { runReminderJob, getReminders } from '../controllers/attendanceTakingReminderController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);

/** Run the reminder job manually. Admin and department_principal (scoped to department when req.departmentId set). */
router.post('/run', authorize('admin', 'super_admin', 'department_principal'), runReminderJob);

/** List reminders. Admin/super_admin see all; department_principal sees only their department. */
router.get('/', authorize('admin', 'super_admin', 'department_principal'), getReminders);

export default router;
