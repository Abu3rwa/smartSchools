import express from 'express';
import {
    approveGoogleFormResponse,
    disconnectGoogleForms,
    getGoogleFormResponses,
    getGoogleFormsAuthUrl,
    getGoogleFormsStatus,
    gradeGoogleFormResponse,
    syncGoogleFormResponses
} from '../controllers/googleFormsController.js';
import { authorize, protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.get('/status', authorize('teacher', 'admin', 'department_principal'), getGoogleFormsStatus);
router.get('/auth/url', authorize('teacher', 'admin', 'department_principal'), getGoogleFormsAuthUrl);
router.delete('/auth/disconnect', authorize('teacher', 'admin', 'department_principal'), disconnectGoogleForms);
router.get(
    '/assignments/:id/responses',
    authorize('teacher', 'admin', 'department_principal'),
    validationRules.mongoId,
    validate,
    getGoogleFormResponses
);
router.post(
    '/assignments/:id/sync',
    authorize('teacher', 'admin', 'department_principal'),
    validationRules.mongoId,
    validate,
    syncGoogleFormResponses
);
router.post(
    '/assignments/:id/grade',
    authorize('teacher', 'admin', 'department_principal'),
    validationRules.mongoId,
    validate,
    gradeGoogleFormResponse
);
router.post(
    '/assignments/:id/approve',
    authorize('teacher', 'admin', 'department_principal'),
    validationRules.mongoId,
    validate,
    approveGoogleFormResponse
);

export default router;
