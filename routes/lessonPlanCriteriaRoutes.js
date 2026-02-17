import express from 'express';
import {
  createCriteria,
  getCriteria,
  getCriteriaById,
  updateCriteria,
  deleteCriteria,
  reorderCriteria,
  initializeDefaultCriteria
} from '../controllers/lessonPlanCriteriaController.js';
import { protect, authorizeWithPermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.MANAGE_SCHOOL_SETTINGS]
), getCriteria);
router.post('/', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.MANAGE_SCHOOL_SETTINGS]
), createCriteria);
router.post('/initialize-defaults', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.MANAGE_SCHOOL_SETTINGS]
), initializeDefaultCriteria);
router.patch('/reorder', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.MANAGE_SCHOOL_SETTINGS]
), reorderCriteria);
router.get('/:id', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.MANAGE_SCHOOL_SETTINGS]
), getCriteriaById);
router.put('/:id', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.MANAGE_SCHOOL_SETTINGS]
), updateCriteria);
router.delete('/:id', authorizeWithPermission(
    ['admin', 'department_principal'],
    [PERMISSIONS.MANAGE_SCHOOL_SETTINGS]
), deleteCriteria);

export default router;
