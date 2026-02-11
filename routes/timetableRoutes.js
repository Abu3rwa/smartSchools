import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    listPeriods,
    createPeriod,
    updatePeriod,
    deletePeriod,
    createAssignment,
    listAssignments,
    updateAssignment,
    deleteAssignment,
    getMyTimetable,
    getStudentTimetable
} from '../controllers/timetableController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// Teacher: own timetable
router.get('/my-timetable', authorize('teacher'), getMyTimetable);
// Student: today's schedule
router.get('/my-schedule', authorize('student'), getStudentTimetable);

// Periods (teachers can read, admins can CRUD)
router.get('/periods', authorize('admin', 'teacher'), listPeriods);
router.post('/periods', authorize('admin'), createPeriod);
router.put('/periods/:id', authorize('admin'), updatePeriod);
router.delete('/periods/:id', authorize('admin'), deletePeriod);

// Assignments
router.get('/assignments', authorize('admin'), listAssignments);
router.post('/assignments', authorize('admin'), createAssignment);
router.put('/assignments/:id', authorize('admin'), updateAssignment);
router.delete('/assignments/:id', authorize('admin'), deleteAssignment);

export default router;
