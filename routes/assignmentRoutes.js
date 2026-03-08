import express from 'express';
import {
    createAssignment,
    deleteAssignment,
    getAssignmentGradebook,
    getAssignments,
    getMyAssignmentsForStudent,
    gradeAssignment,
    publishAssignment,
    updateAssignment
} from '../controllers/assignmentController.js';
import { authorize, protect, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/', authorize('teacher', 'admin', 'department_principal'), getAssignments);
router.get('/my', authorize('student'), getMyAssignmentsForStudent);

router.post(
    '/',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
    createAssignment
);

router.post(
    '/:id/publish',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.PUBLISH_ASSIGNMENTS),
    validationRules.mongoId,
    validate,
    publishAssignment
);

router.put(
    '/:id',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
    validationRules.mongoId,
    validate,
    updateAssignment
);

router.delete(
    '/:id',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
    validationRules.mongoId,
    validate,
    deleteAssignment
);

router.get(
    '/:id/gradebook',
    authorize('teacher', 'admin', 'department_principal'),
    validationRules.mongoId,
    validate,
    getAssignmentGradebook
);

router.post(
    '/:id/grades',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.GRADE_ASSIGNMENTS),
    validationRules.mongoId,
    validate,
    gradeAssignment
);

export default router;
