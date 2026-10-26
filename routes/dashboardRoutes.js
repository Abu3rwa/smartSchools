import express from 'express';
import { getSchoolAdminSummary } from '../controllers/dashboardController.js';
import { authorize, protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get(
    '/school-admin',
    authorize('admin', 'department_principal'),
    getSchoolAdminSummary
);

export default router;
