import express from 'express';
import { protect, authorizeWithPermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    getSchoolCalendar,
    upsertSchoolCalendarConfig,
    upsertSchoolDayException,
    deleteSchoolDayException
} from '../controllers/academicCalendarController.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();
const manageSchoolCalendarAccess = authorizeWithPermission(
    ['admin'],
    [PERMISSIONS.MANAGE_SCHOOL_SETTINGS]
);

router.use(protect);
router.use(requireSchoolContext);

router.get('/', manageSchoolCalendarAccess, getSchoolCalendar);
router.put('/config', manageSchoolCalendarAccess, upsertSchoolCalendarConfig);
router.put('/exceptions/:date', manageSchoolCalendarAccess, upsertSchoolDayException);
router.delete('/exceptions/:date', manageSchoolCalendarAccess, deleteSchoolDayException);

export default router;
