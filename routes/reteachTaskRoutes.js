import express from 'express';
import {
    createReteachTaskController,
    getReteachTasksForClassController,
    updateReteachTaskController
} from '../controllers/reteachTaskController.js';
import { authorize, protect, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(requireFeature('academicIntelligence'));
router.use(resolveDepartmentScope);

router.post('/', authorize('admin', 'department_principal', 'teacher'), createReteachTaskController);
router.get('/class/:id', authorize('admin', 'department_principal', 'teacher'), getReteachTasksForClassController);
router.patch('/:id', authorize('admin', 'department_principal', 'teacher'), updateReteachTaskController);

export default router;