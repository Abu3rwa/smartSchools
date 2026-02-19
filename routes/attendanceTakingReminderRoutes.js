import express from 'express';
import { protect, authorize, authorizeWithPermission, resolveDepartmentScope } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { runReminderJob, getReminders } from '../controllers/attendanceReminderController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);

/** Run the reminder job manually. Admin and department_principal (scoped to department when req.departmentId set). */
router.post('/run', authorizeWithPermission(
    ['admin', 'super_admin', 'department_principal', 'attendance_manager'],
    [PERMISSIONS.MANAGE_ATTENDANCE_REMINDERS]
), runReminderJob);

/** List reminders. Admin/super_admin see all; department_principal sees only their department. */
router.get('/', authorizeWithPermission(
    ['admin', 'super_admin', 'department_principal', 'attendance_manager'],
    [PERMISSIONS.MANAGE_ATTENDANCE_REMINDERS, PERMISSIONS.VIEW_ATTENDANCE_REPORTS]
), getReminders);

export default router;
