import express from 'express';
import {
    getSchedules,
    getScheduleById,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    cancelSchedule,
    getSchedulesByDateRange,
    getRoomAvailability,
    getTeacherSchedule,
    getStudentSchedule,
    recordAttendance,
    getAttendanceStats,
    addParticipant,
    removeParticipant,
    updateParticipantStatus
} from '../controllers/scheduleController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

// Apply authentication and school context middleware to all routes
router.use(protect);
router.use(requireSchoolContext);

// @route   GET /api/schedules
// @desc    Get all schedules for a school
// @access  Private (School Admin, Teacher, Student)
router.get('/', getSchedules);

// @route   GET /api/schedules/calendar
// @desc    Get schedules by date range
// @access  Private
router.get('/calendar', getSchedulesByDateRange);

// @route   GET /api/schedules/room-availability
// @desc    Get which rooms are available for a time range (for schedule create/edit)
// @access  Private (Admin, Teacher)
router.get('/room-availability', authorize('admin', 'department_principal', 'teacher'), getRoomAvailability);

// @route   GET /api/schedules/teacher/:teacherId
// @desc    Get teacher schedule
// @access  Private
router.get('/teacher/:teacherId', getTeacherSchedule);

// @route   GET /api/schedules/student/:studentId
// @desc    Get student schedule
// @access  Private
router.get('/student/:studentId', getStudentSchedule);

// @route   POST /api/schedules
// @desc    Create new schedule
// @access  Private (School Admin, Teacher)
router.post('/', authorize('admin', 'department_principal', 'teacher'), createSchedule);

// @route   GET /api/schedules/:id
// @desc    Get single schedule by ID
// @access  Private
router.get('/:id', getScheduleById);

// @route   PUT /api/schedules/:id
// @desc    Update schedule
// @access  Private (School Admin, Teacher)
router.put('/:id', authorize('admin', 'department_principal', 'teacher'), updateSchedule);

// @route   DELETE /api/schedules/:id
// @desc    Delete schedule
// @access  Private (School Admin, Teacher)
router.delete('/:id', authorize('admin', 'department_principal', 'teacher'), deleteSchedule);

// @route   POST /api/schedules/:id/cancel
// @desc    Cancel schedule
// @access  Private (School Admin, Teacher)
router.post('/:id/cancel', authorize('admin', 'department_principal', 'teacher'), cancelSchedule);

// @route   GET /api/schedules/:id/attendance
// @desc    Get attendance statistics
// @access  Private
router.get('/:id/attendance', getAttendanceStats);

// @route   POST /api/schedules/:id/attendance
// @desc    Record attendance for schedule
// @access  Private (Teacher, School Admin)
router.post('/:id/attendance', authorize('admin', 'department_principal', 'teacher'), recordAttendance);

// @route   POST /api/schedules/:id/participants
// @desc    Add participant to schedule
// @access  Private (School Admin, Teacher)
router.post('/:id/participants', authorize('admin', 'department_principal', 'teacher'), addParticipant);

// @route   DELETE /api/schedules/:id/participants/:userId
// @desc    Remove participant from schedule
// @access  Private (School Admin, Teacher)
router.delete('/:id/participants/:userId', authorize('admin', 'department_principal', 'teacher'), removeParticipant);

// @route   PUT /api/schedules/:id/participants/:userId
// @desc    Update participant status
// @access  Private
router.put('/:id/participants/:userId', updateParticipantStatus);

export default router;
