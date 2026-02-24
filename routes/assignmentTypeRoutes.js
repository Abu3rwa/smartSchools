import express from 'express';
import {
    createAssignmentType,
    getAssignmentTypes,
    updateAssignmentType
} from '../controllers/assignmentTypeController.js';
import { authorize, protect, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/', authorize('teacher', 'admin', 'department_principal'), getAssignmentTypes);

router.post(
    '/',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.MANAGE_ASSIGNMENT_CONFIG),
    createAssignmentType
);

router.put(
    '/:id',
    authorize('teacher', 'admin'),
    requirePermission(PERMISSIONS.MANAGE_ASSIGNMENT_CONFIG),
    validationRules.mongoId,
    validate,
    updateAssignmentType
);

export default router;
