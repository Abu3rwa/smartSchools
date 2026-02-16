import express from 'express';
import {
    getDepartments,
    getDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment
} from '../controllers/departmentController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { parseQueryFilter } from '../middleware/queryFilter.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(parseQueryFilter);

router.route('/')
    .get(authorize('admin', 'department_principal'), getDepartments)
    .post(authorize('admin'), createDepartment);

router.route('/:id')
    .get(authorize('admin', 'department_principal'), validationRules.mongoId, validate, getDepartment)
    .put(authorize('admin'), validationRules.mongoId, validate, updateDepartment)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteDepartment);

export default router;
