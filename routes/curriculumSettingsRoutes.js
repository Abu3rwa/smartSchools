import express from 'express';
import { getCurriculumSettings, updateCurriculumSettings } from '../controllers/curriculumSettingsController.js';
import { PERMISSIONS } from '../config/permissions.js';
import { authorizeWithPermission, protect, resolveDepartmentScope } from '../middleware/auth.js';
import { validateRequestSchema } from '../middleware/schemaValidator.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { curriculumSettingsBodySchema } from '../validators/curriculumValidators.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);

router.get(
    '/',
    authorizeWithPermission(
        ['admin', 'department_principal', 'teacher'],
        [
            PERMISSIONS.MANAGE_SCHOOL_SETTINGS,
            PERMISSIONS.EDIT_CURRICULUM_MAPS,
            PERMISSIONS.VIEW_CURRICULUM_MAPS
        ]
    ),
    getCurriculumSettings
);

router.patch(
    '/',
    authorizeWithPermission(
        ['admin', 'department_principal'],
        [
            PERMISSIONS.MANAGE_SCHOOL_SETTINGS,
            PERMISSIONS.CONFIGURE_CURRICULUM_MAP_TEMPLATES
        ]
    ),
    validateRequestSchema({ bodySchema: curriculumSettingsBodySchema }),
    updateCurriculumSettings
);

export default router;
