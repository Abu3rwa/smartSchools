import express from 'express';
import { protect } from '../middleware/auth.js';
import { superAdminOnly } from '../middleware/tenantIsolation.js';
import {
    decidePlatformCreditRequest,
    fundSchool,
    getPlatformCredit,
    grantTeacherCredit,
    listPlatformSchools,
    updatePlatformMarkup
} from '../controllers/aiCreditController.js';

const router = express.Router();

// Platform-level, so no school context: the super admin owns the provider contract.
router.use(protect);
router.use(superAdminOnly);

router.get('/', getPlatformCredit);
router.patch('/settings', updatePlatformMarkup);
router.get('/schools', listPlatformSchools);
router.post('/schools/:schoolId/fund', fundSchool);
router.post('/schools/:schoolId/teachers/:userId/grant', grantTeacherCredit);
router.post('/requests/:requestId/decide', decidePlatformCreditRequest);

export default router;
