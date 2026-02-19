import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    getSchoolCalendar,
    upsertSchoolCalendarConfig,
    upsertSchoolDayException,
    deleteSchoolDayException
} from '../controllers/academicCalendarController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/', authorize('admin'), getSchoolCalendar);
router.put('/config', authorize('admin'), upsertSchoolCalendarConfig);
router.put('/exceptions/:date', authorize('admin'), upsertSchoolDayException);
router.delete('/exceptions/:date', authorize('admin'), deleteSchoolDayException);

export default router;
