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
const classroomManagerRoles = ['teacher', 'admin', 'department_principal'];

router.use(protect);
router.use(requireSchoolContext);

// Reachable even when the feature is off so the client can learn that it is disabled.
router.get('/status', authorize('teacher', 'admin', 'department_principal'), getClassroomStatus);

router.use(requireClassroomEnabled);

router.get('/auth/url', authorize(...classroomManagerRoles), getClassroomAuthUrl);
router.delete('/auth/disconnect', authorize(...classroomManagerRoles), disconnectClassroom);

router.get('/courses', authorize(...classroomManagerRoles), listClassroomCourses);

router.get('/mappings', authorize(...classroomManagerRoles), listClassroomMappings);
router.put('/mappings', authorize(...classroomManagerRoles), upsertClassroomMapping);
router.delete('/mappings/:id', authorize(...classroomManagerRoles), validationRules.mongoId, validate, deleteClassroomMapping);

router.get('/links', authorize('teacher', 'admin', 'department_principal'), getClassroomLinks);

router.post(
    '/assignments/:id/publish',
    authorize(...classroomManagerRoles),
    validationRules.mongoId,
    validate,
    publishAssignmentToClassroom
);
router.post(
    '/assignments/:id/retry',
    authorize(...classroomManagerRoles),
    validationRules.mongoId,
    validate,
    publishAssignmentToClassroom
);

export default router;
