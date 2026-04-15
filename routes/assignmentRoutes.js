import express from 'express';
import {
    createAssignment,
    deleteAssignment,
    getAssignmentAttachmentUrl,
    getAssignmentGradebook,
    getAssignments,
    getMyAssignmentsForStudent,
    gradeAssignment,
    publishAssignment,
    sendAssignmentReminder,
    updateAssignment
} from '../controllers/assignmentController.js';
import { authorize, protect, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';
import { uploadAssignmentAttachments } from '../middleware/uploadAssignmentAttachments.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/', authorize('teacher', 'admin', 'department_principal'), getAssignments);
router.get('/my', authorize('student'), getMyAssignmentsForStudent);

router.post(
    '/',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
    uploadAssignmentAttachments.array('attachments', 5),
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

router.post(
    '/:id/remind',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
    validationRules.mongoId,
    validate,
    sendAssignmentReminder
);

router.put(
    '/:id',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.CREATE_ASSIGNMENTS),
    uploadAssignmentAttachments.array('attachments', 5),
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

router.get(
    '/:id/attachments/:attachmentId/url',
    authorize('teacher', 'admin', 'student', 'department_principal'),
    validationRules.mongoId,
    validate,
    getAssignmentAttachmentUrl
);

export default router;
