import express from 'express';
import {
    addCurriculumMapComment,
    applyCurriculumImportJob,
    cloneCurriculumMapToYear,
    createCurriculumMap,
    createCurriculumMapVersion,
    exportCurriculumMap,
    deleteCurriculumMap,
    getCurriculumImportJob,
    getCurriculumMapHistory,
    getCurriculumMapById,
    importCurriculumSourceFromGoogleDoc,
    listCurriculumImportSources,
    listCurriculumOptions,
    listCurriculumMaps,
    publishCurriculumMap,
    reviewCurriculumMap,
    submitCurriculumMap,
    transitionCurriculumMap,
    uploadCurriculumImportSource,
    updateCurriculumMap
} from '../controllers/curriculumMapController.js';
import { PERMISSIONS } from '../config/permissions.js';
import { authorizeWithPermission, protect, resolveDepartmentScope } from '../middleware/auth.js';
import { validateRequestSchema } from '../middleware/schemaValidator.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { uploadCurriculumSourceFile } from '../middleware/uploadCurriculumSource.js';
import {
    curriculumImportApplyBodySchema,
    curriculumImportGoogleDocBodySchema,
    curriculumImportJobParamsSchema,
    curriculumMapCommentBodySchema,
    curriculumIdParamsSchema,
    curriculumMapCloneYearBodySchema,
    curriculumMapCreateBodySchema,
    curriculumMapListQuerySchema,
    curriculumMapReviewBodySchema,
    curriculumMapWorkflowActionBodySchema,
    curriculumMapUpdateBodySchema,
    exportQuerySchema
} from '../validators/curriculumValidators.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);

const uploadCurriculumSourceFileMiddleware = (req, res, next) => {
    uploadCurriculumSourceFile(req, res, (error) => {
        if (!error) return next();
        error.statusCode = 400;
        return next(error);
    });
};

router.get(
    '/',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.VIEW_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.EXPORT_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({ querySchema: curriculumMapListQuerySchema }),
    listCurriculumMaps
);

router.get(
    '/options',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.VIEW_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.EXPORT_CURRICULUM_MAP
        ]
    ),
    listCurriculumOptions
);

router.post(
    '/',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [PERMISSIONS.EDIT_CURRICULUM_MAPS, PERMISSIONS.CREATE_CURRICULUM_MAP]
    ),
    validateRequestSchema({ bodySchema: curriculumMapCreateBodySchema }),
    createCurriculumMap
);

router.get(
    '/:mapId',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.VIEW_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.EXPORT_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({ paramsSchema: curriculumIdParamsSchema }),
    getCurriculumMapById
);

router.patch(
    '/:mapId',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
            PERMISSIONS.EDIT_ANY_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({
        paramsSchema: curriculumIdParamsSchema,
        bodySchema: curriculumMapUpdateBodySchema
    }),
    updateCurriculumMap
);

router.delete(
    '/:mapId',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.REVIEW_CURRICULUM_MAPS,
            PERMISSIONS.PUBLISH_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
            PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES
        ]
    ),
    validateRequestSchema({ paramsSchema: curriculumIdParamsSchema }),
    deleteCurriculumMap
);

router.post(
    '/:mapId/submit-review',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
            PERMISSIONS.CREATE_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({ paramsSchema: curriculumIdParamsSchema }),
    submitCurriculumMap
);

router.post(
    '/:mapId/review',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [
            PERMISSIONS.REVIEW_CURRICULUM_MAPS,
            PERMISSIONS.REVIEW_CURRICULUM_MAP,
            PERMISSIONS.APPROVE_CURRICULUM_MAP,
            PERMISSIONS.REJECT_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({
        paramsSchema: curriculumIdParamsSchema,
        bodySchema: curriculumMapReviewBodySchema
    }),
    reviewCurriculumMap
);

router.post(
    '/:mapId/publish',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [PERMISSIONS.PUBLISH_CURRICULUM_MAPS, PERMISSIONS.APPROVE_CURRICULUM_MAP]
    ),
    validateRequestSchema({ paramsSchema: curriculumIdParamsSchema }),
    publishCurriculumMap
);

router.post(
    '/:mapId/new-version',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
            PERMISSIONS.EDIT_ANY_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({ paramsSchema: curriculumIdParamsSchema }),
    createCurriculumMapVersion
);

router.post(
    '/:mapId/clone-year',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [PERMISSIONS.EDIT_CURRICULUM_MAPS, PERMISSIONS.EDIT_ANY_CURRICULUM_MAP]
    ),
    validateRequestSchema({
        paramsSchema: curriculumIdParamsSchema,
        bodySchema: curriculumMapCloneYearBodySchema
    }),
    cloneCurriculumMapToYear
);

router.get(
    '/:mapId/export',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.VIEW_CURRICULUM_MAPS,
            PERMISSIONS.EXPORT_CURRICULUM_MAP,
            PERMISSIONS.PRINT_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({
        paramsSchema: curriculumIdParamsSchema,
        querySchema: exportQuerySchema
    }),
    exportCurriculumMap
);

router.post(
    '/:mapId/transition',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.REVIEW_CURRICULUM_MAPS,
            PERMISSIONS.PUBLISH_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
            PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
            PERMISSIONS.REVIEW_CURRICULUM_MAP,
            PERMISSIONS.APPROVE_CURRICULUM_MAP,
            PERMISSIONS.REJECT_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({
        paramsSchema: curriculumIdParamsSchema,
        bodySchema: curriculumMapWorkflowActionBodySchema
    }),
    transitionCurriculumMap
);

router.post(
    '/:mapId/comments',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.VIEW_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.REVIEW_CURRICULUM_MAPS
        ]
    ),
    validateRequestSchema({
        paramsSchema: curriculumIdParamsSchema,
        bodySchema: curriculumMapCommentBodySchema
    }),
    addCurriculumMapComment
);

router.get(
    '/:mapId/history',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.VIEW_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.REVIEW_CURRICULUM_MAPS
        ]
    ),
    validateRequestSchema({ paramsSchema: curriculumIdParamsSchema }),
    getCurriculumMapHistory
);

router.post(
    '/:mapId/ai/sources/upload',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
            PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
            PERMISSIONS.CREATE_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({ paramsSchema: curriculumIdParamsSchema }),
    uploadCurriculumSourceFileMiddleware,
    uploadCurriculumImportSource
);

router.post(
    '/:mapId/ai/sources/import-google-doc',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
            PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
            PERMISSIONS.CREATE_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({
        paramsSchema: curriculumIdParamsSchema,
        bodySchema: curriculumImportGoogleDocBodySchema
    }),
    importCurriculumSourceFromGoogleDoc
);

router.get(
    '/:mapId/ai/sources',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.VIEW_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.REVIEW_CURRICULUM_MAPS,
            PERMISSIONS.EXPORT_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({ paramsSchema: curriculumIdParamsSchema }),
    listCurriculumImportSources
);

router.get(
    '/:mapId/ai/jobs/:jobId',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.VIEW_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.REVIEW_CURRICULUM_MAPS,
            PERMISSIONS.EXPORT_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({ paramsSchema: curriculumImportJobParamsSchema }),
    getCurriculumImportJob
);

router.post(
    '/:mapId/ai/jobs/:jobId/apply',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.EDIT_OWN_CURRICULUM_MAP,
            PERMISSIONS.EDIT_ANY_CURRICULUM_MAP,
            PERMISSIONS.CREATE_CURRICULUM_MAP
        ]
    ),
    validateRequestSchema({
        paramsSchema: curriculumImportJobParamsSchema,
        bodySchema: curriculumImportApplyBodySchema
    }),
    applyCurriculumImportJob
);

export default router;
