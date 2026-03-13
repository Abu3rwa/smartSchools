import express from 'express';
import {
    createPacingGuide,
    exportPacingGuide,
    getPacingGuideById,
    listPacingGuides,
    publishPacingGuide,
    reconcilePacingGuide,
    reviewPacingGuide,
    submitPacingGuide,
    updatePacingGuide
} from '../controllers/pacingGuideController.js';
import { PERMISSIONS } from '../config/permissions.js';
import { authorizeWithPermission, protect, resolveDepartmentScope } from '../middleware/auth.js';
import { validateRequestSchema } from '../middleware/schemaValidator.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    exportQuerySchema,
    pacingGuideCreateBodySchema,
    pacingGuideListQuerySchema,
    pacingGuideReconcileBodySchema,
    pacingGuideReviewBodySchema,
    pacingGuideUpdateBodySchema,
    pacingIdParamsSchema
} from '../validators/curriculumValidators.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);

router.get(
    '/',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [PERMISSIONS.VIEW_PACING_GUIDES, PERMISSIONS.EDIT_PACING_GUIDES]
    ),
    validateRequestSchema({ querySchema: pacingGuideListQuerySchema }),
    listPacingGuides
);

router.post(
    '/',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [PERMISSIONS.EDIT_PACING_GUIDES]
    ),
    validateRequestSchema({ bodySchema: pacingGuideCreateBodySchema }),
    createPacingGuide
);

router.get(
    '/:guideId',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [PERMISSIONS.VIEW_PACING_GUIDES, PERMISSIONS.EDIT_PACING_GUIDES]
    ),
    validateRequestSchema({ paramsSchema: pacingIdParamsSchema }),
    getPacingGuideById
);

router.patch(
    '/:guideId',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [PERMISSIONS.EDIT_PACING_GUIDES]
    ),
    validateRequestSchema({
        paramsSchema: pacingIdParamsSchema,
        bodySchema: pacingGuideUpdateBodySchema
    }),
    updatePacingGuide
);

router.post(
    '/:guideId/submit-review',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [PERMISSIONS.EDIT_PACING_GUIDES]
    ),
    validateRequestSchema({ paramsSchema: pacingIdParamsSchema }),
    submitPacingGuide
);

router.post(
    '/:guideId/review',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [PERMISSIONS.REVIEW_PACING_GUIDES]
    ),
    validateRequestSchema({
        paramsSchema: pacingIdParamsSchema,
        bodySchema: pacingGuideReviewBodySchema
    }),
    reviewPacingGuide
);

router.post(
    '/:guideId/publish',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [PERMISSIONS.PUBLISH_PACING_GUIDES]
    ),
    validateRequestSchema({ paramsSchema: pacingIdParamsSchema }),
    publishPacingGuide
);

router.post(
    '/:guideId/reconcile',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [PERMISSIONS.EDIT_PACING_GUIDES]
    ),
    validateRequestSchema({
        paramsSchema: pacingIdParamsSchema,
        bodySchema: pacingGuideReconcileBodySchema
    }),
    reconcilePacingGuide
);

router.get(
    '/:guideId/export',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [PERMISSIONS.VIEW_PACING_GUIDES]
    ),
    validateRequestSchema({
        paramsSchema: pacingIdParamsSchema,
        querySchema: exportQuerySchema
    }),
    exportPacingGuide
);

export default router;
