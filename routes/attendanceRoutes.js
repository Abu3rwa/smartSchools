import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    getTeacherAttendance,
    getAdminAttendance,
    createOrUpdateAttendance,
    getAttendanceDetails,
    getAttendanceAnalytics,
    getMissedAttendance,
    exportAttendanceData,
    lockAttendance,
    getMyTodayPeriods,
    takePeriodAttendance,
    getMyAttendance
} from '../controllers/attendanceController.js';
import { authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and school context
router.use(protect);
router.use(requireSchoolContext);

// Student: own attendance
router.get('/my-attendance', authorize('student'), getMyAttendance);

// Teacher period-based attendance
router.get('/my-today', authorize('teacher'), getMyTodayPeriods);
router.post('/take', authorize('teacher'), takePeriodAttendance);

// Teacher attendance routes
router.get('/teacher', authorize('teacher', 'admin', 'department_principal'), getTeacherAttendance);

// Admin attendance routes
router.get('/admin', authorize('admin', 'department_principal'), getAdminAttendance);
router.get('/analytics', authorize('admin', 'department_principal'), getAttendanceAnalytics);
router.get('/missed', authorize('admin', 'department_principal'), getMissedAttendance);
router.get('/export', authorize('admin', 'department_principal'), exportAttendanceData);

// Common routes
router.post('/', authorize('teacher', 'admin', 'department_principal'), createOrUpdateAttendance);
router.get('/:id', authorize('teacher', 'admin', 'department_principal'), getAttendanceDetails);
router.post('/:id/lock', authorize('admin', 'department_principal'), lockAttendance);

export default router;
