import express from 'express';
import {
    deleteClassroomMapping,
    disconnectClassroom,
    getClassroomAuthUrl,
    getClassroomLinks,
    getClassroomStatus,
    listClassroomCourses,
    listClassroomMappings,
    publishAssignmentToClassroom,
    upsertClassroomMapping
} from '../controllers/googleClassroomController.js';
import { authorize, protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';
import { requireClassroomEnabled } from '../config/classroomConfig.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// Reachable even when the feature is off so the client can learn that it is disabled.
router.get('/status', authorize('teacher', 'admin', 'department_principal'), getClassroomStatus);

router.use(requireClassroomEnabled);

router.get('/auth/url', authorize('teacher'), getClassroomAuthUrl);
router.delete('/auth/disconnect', authorize('teacher'), disconnectClassroom);

router.get('/courses', authorize('teacher'), listClassroomCourses);

router.get('/mappings', authorize('teacher'), listClassroomMappings);
router.put('/mappings', authorize('teacher'), upsertClassroomMapping);
router.delete('/mappings/:id', authorize('teacher'), validationRules.mongoId, validate, deleteClassroomMapping);

router.get('/links', authorize('teacher', 'admin', 'department_principal'), getClassroomLinks);

router.post(
    '/assignments/:id/publish',
    authorize('teacher'),
    validationRules.mongoId,
    validate,
    publishAssignmentToClassroom
);
router.post(
    '/assignments/:id/retry',
    authorize('teacher'),
    validationRules.mongoId,
    validate,
    publishAssignmentToClassroom
);

export default router;
