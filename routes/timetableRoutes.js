import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    listPeriods,
    createPeriod,
    importPeriods,
    updatePeriod,
    deletePeriod,
    createAssignment,
    listAssignments,
    updateAssignment,
    deleteAssignment,
    bulkUpdateAssignmentDates,
    migrateAssignmentsYear,
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

// Periods (teachers can read; admins and principals can CRUD)
router.get('/periods', authorize('admin', 'department_principal', 'teacher'), listPeriods);
router.post('/periods', authorize('admin', 'department_principal'), createPeriod);
router.post('/periods/import', authorize('admin', 'department_principal'), importPeriods);
router.put('/periods/:id', authorize('admin', 'department_principal'), updatePeriod);
router.delete('/periods/:id', authorize('admin', 'department_principal'), deletePeriod);

// Assignments (admins and principals can CRUD)
router.get('/assignments', authorize('admin', 'department_principal'), listAssignments);
router.put('/assignments/bulk-dates', authorize('admin', 'department_principal'), bulkUpdateAssignmentDates);
router.post('/assignments/migrate-year', authorize('admin', 'department_principal'), migrateAssignmentsYear);
router.post('/assignments', authorize('admin', 'department_principal'), createAssignment);
router.put('/assignments/:id', authorize('admin', 'department_principal'), updateAssignment);
router.delete('/assignments/:id', authorize('admin', 'department_principal'), deleteAssignment);

export default router;
