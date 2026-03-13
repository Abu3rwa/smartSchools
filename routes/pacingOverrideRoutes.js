import express from 'express';
import {
    approvePacingOverride,
    createPacingOverride,
    listPacingOverrides,
    rejectPacingOverride
} from '../controllers/pacingOverrideController.js';
import { PERMISSIONS } from '../config/permissions.js';
import { authorizeWithPermission, protect, resolveDepartmentScope } from '../middleware/auth.js';
import { validateRequestSchema } from '../middleware/schemaValidator.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    pacingOverrideCreateBodySchema,
    pacingOverrideDecisionBodySchema,
    pacingOverrideIdParamsSchema,
    pacingOverrideListQuerySchema
} from '../validators/curriculumValidators.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);

router.post(
    '/',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [PERMISSIONS.EDIT_PACING_GUIDES]
    ),
    validateRequestSchema({ bodySchema: pacingOverrideCreateBodySchema }),
    createPacingOverride
);

router.get(
    '/',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [PERMISSIONS.APPROVE_PACING_OVERRIDES]
    ),
    validateRequestSchema({ querySchema: pacingOverrideListQuerySchema }),
    listPacingOverrides
);

router.post(
    '/:overrideId/approve',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [PERMISSIONS.APPROVE_PACING_OVERRIDES]
    ),
    validateRequestSchema({
        paramsSchema: pacingOverrideIdParamsSchema,
        bodySchema: pacingOverrideDecisionBodySchema
    }),
    approvePacingOverride
);

router.post(
    '/:overrideId/reject',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [PERMISSIONS.APPROVE_PACING_OVERRIDES]
    ),
    validateRequestSchema({
        paramsSchema: pacingOverrideIdParamsSchema,
        bodySchema: pacingOverrideDecisionBodySchema
    }),
    rejectPacingOverride
);

export default router;
