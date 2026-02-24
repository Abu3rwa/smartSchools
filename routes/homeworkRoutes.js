import express from 'express';
import { body } from 'express-validator';
import {
    createHomeworkAssignment,
    getHomeworkAssignmentById,
    getHomeworkAssignments,
    getHomeworkSubmissions,
    getMyHomeworkAssignmentById,
    getMyHomeworkAssignments,
    publishHomeworkAssignment,
    submitMyHomeworkAssignment,
    updateHomeworkAssignment
} from '../controllers/homeworkController.js';
import { authorize, protect, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/student/mine', authorize('student'), getMyHomeworkAssignments);
router.get('/student/:id', authorize('student'), validationRules.mongoId, validate, getMyHomeworkAssignmentById);
router.post(
    '/student/:id/submit',
    authorize('student'),
    validationRules.mongoId,
    body('submissionText')
        .isString()
        .trim()
        .isLength({ min: 1, max: 5000 })
        .withMessage('submissionText is required and must be at most 5000 characters'),
    validate,
    submitMyHomeworkAssignment
);
router.put(
    '/student/:id/submit',
    authorize('student'),
    validationRules.mongoId,
    body('submissionText')
        .isString()
        .trim()
        .isLength({ min: 1, max: 5000 })
        .withMessage('submissionText is required and must be at most 5000 characters'),
    validate,
    submitMyHomeworkAssignment
);

router.get(
    '/',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.CREATE_HOMEWORK),
    getHomeworkAssignments
);
router.post(
    '/',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.CREATE_HOMEWORK),
    createHomeworkAssignment
);
router.get(
    '/:id',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.CREATE_HOMEWORK),
    validationRules.mongoId,
    validate,
    getHomeworkAssignmentById
);
router.put(
    '/:id',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.CREATE_HOMEWORK),
    validationRules.mongoId,
    validate,
    updateHomeworkAssignment
);
router.post(
    '/:id/publish',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.PUBLISH_HOMEWORK),
    validationRules.mongoId,
    validate,
    publishHomeworkAssignment
);
router.get(
    '/:id/submissions',
    authorize('teacher', 'admin', 'department_principal'),
    requirePermission(PERMISSIONS.VIEW_HOMEWORK_SUBMISSIONS),
    validationRules.mongoId,
    validate,
    getHomeworkSubmissions
);

export default router;
