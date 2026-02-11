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
router.get('/my-today', getMyTodayPeriods);
router.post('/take', takePeriodAttendance);

// Teacher attendance routes
router.get('/teacher', getTeacherAttendance);

// Admin attendance routes
router.get('/admin', getAdminAttendance);
router.get('/analytics', getAttendanceAnalytics);
router.get('/missed', getMissedAttendance);
router.get('/export', exportAttendanceData);

// Common routes
router.post('/', createOrUpdateAttendance);
router.get('/:id', getAttendanceDetails);
router.post('/:id/lock', lockAttendance);

export default router;
