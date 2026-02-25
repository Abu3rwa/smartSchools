import express from 'express';
import {
    cancelCalendarEventController,
    createCalendarEventController,
    getCalendarEventByIdController,
    getCalendarNotificationPreferencesController,
    listCalendarEventsController,
    listUpcomingCalendarEventsController,
    updateCalendarEventController,
    updateCalendarNotificationPreferencesController
} from '../controllers/calendarController.js';
import { authorizeWithPermission, protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate } from '../middleware/validator.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    calendarEventIdParam,
    createCalendarEventRules,
    listCalendarEventsRules,
    upcomingCalendarEventsRules,
    updateCalendarEventRules,
    updateCalendarNotificationPreferencesRules
} from '../validators/calendarValidators.js';

const router = express.Router();

const manageCalendarAccess = authorizeWithPermission(
    ['admin', 'super_admin', 'department_principal'],
    [PERMISSIONS.MANAGE_EVENTS]
);

router.use(protect);
router.use(requireSchoolContext);

router.post(
    '/events',
    manageCalendarAccess,
    createCalendarEventRules,
    validate,
    createCalendarEventController
);

router.patch(
    '/events/:id',
    manageCalendarAccess,
    updateCalendarEventRules,
    validate,
    updateCalendarEventController
);

router.patch(
    '/events/:id/cancel',
    manageCalendarAccess,
    calendarEventIdParam,
    validate,
    cancelCalendarEventController
);

router.get(
    '/events/:id',
    calendarEventIdParam,
    validate,
    getCalendarEventByIdController
);

router.get(
    '/events',
    listCalendarEventsRules,
    validate,
    listCalendarEventsController
);

router.get(
    '/upcoming',
    upcomingCalendarEventsRules,
    validate,
    listUpcomingCalendarEventsController
);

router.get(
    '/notifications/preferences',
    getCalendarNotificationPreferencesController
);

router.put(
    '/notifications/preferences',
    updateCalendarNotificationPreferencesRules,
    validate,
    updateCalendarNotificationPreferencesController
);

export default router;
