import express from 'express';
import {
    getParentChildrenController,
    getParentDashboardController,
    getParentUpdatesController
} from '../controllers/parentController.js';
import { authorize, protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('parent'));

router.get('/children', getParentChildrenController);
router.get('/dashboard', getParentDashboardController);
router.get('/updates', getParentUpdatesController);

export default router;

