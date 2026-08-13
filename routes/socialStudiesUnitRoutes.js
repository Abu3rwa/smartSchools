import express from 'express';
import { getUnits, getUnit, createUnit, updateUnit, deleteUnit } from '../controllers/socialStudiesUnitController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();
router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(requireFeature('socialStudies'));

router.route('/')
    .get(authorize('admin', 'teacher', 'department_principal', 'student', 'parent'), getUnits)
    .post(authorize('admin', 'teacher'), createUnit);

router.route('/:id')
    .get(authorize('admin', 'teacher', 'department_principal', 'student', 'parent'), getUnit)
    .put(authorize('admin', 'teacher'), updateUnit)
    .delete(authorize('admin', 'teacher'), deleteUnit);

export default router;
