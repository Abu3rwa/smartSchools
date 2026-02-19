import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    getSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    assignSubstituteTeacher,
    createFromTemplate,
    getAvailableRooms,
    getTeacherSchedule,
    getRoomSchedule,
    getClassSchedule,
    resolveConflict,
    getScheduleTemplates,
    createScheduleTemplate
} from '../controllers/advancedScheduleController.js';

const router = express.Router();

// All routes require authentication and school context
router.use(protect);
router.use(requireSchoolContext);

// Public schedule routes (admin and teacher)
router.get('/', getSchedules);
router.get('/teacher/:teacherId', getTeacherSchedule);
router.get('/room/:roomId', getRoomSchedule);
router.get('/class/:classId', getClassSchedule);
router.get('/available-rooms', getAvailableRooms);

// Template routes
router.get('/templates', getScheduleTemplates);
router.post('/templates', createScheduleTemplate);
router.post('/from-template/:templateId', createFromTemplate);

// Admin-only routes
router.post('/', authorize('admin'), createSchedule);
router.put('/:id', authorize('admin'), updateSchedule);
router.delete('/:id', authorize('admin'), deleteSchedule);
router.post('/:id/substitute', authorize('admin'), assignSubstituteTeacher);
router.post('/:id/resolve-conflict', authorize('admin'), resolveConflict);

export default router;
