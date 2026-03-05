import express from 'express';
import {
    createGradingScale,
    deleteGradingScale,
    getActiveGradingScale,
    getGradingScales,
    setDefaultGradingScale,
    updateGradingScale
} from '../controllers/gradingScaleController.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/', getGradingScales);
router.get('/active', getActiveGradingScale);

router.post(
    '/',
    requirePermission(PERMISSIONS.MANAGE_GRADE_SCALING),
    createGradingScale
);

router.put(
    '/:id',
    requirePermission(PERMISSIONS.MANAGE_GRADE_SCALING),
    validationRules.mongoId,
    validate,
    updateGradingScale
);

router.patch(
    '/:id/default',
    requirePermission(PERMISSIONS.MANAGE_GRADE_SCALING),
    validationRules.mongoId,
    validate,
    setDefaultGradingScale
);

router.delete(
    '/:id',
    requirePermission(PERMISSIONS.MANAGE_GRADE_SCALING),
    validationRules.mongoId,
    validate,
    deleteGradingScale
);

export default router;
