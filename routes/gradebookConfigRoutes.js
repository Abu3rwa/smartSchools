import express from 'express';
import { getConfig, getCategories, createConfig, updateConfig, cloneConfig } from '../controllers/gradebookConfigController.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// Read endpoints — any authenticated user in the school
router.get('/', getConfig);
router.get('/categories', getCategories);

// Write endpoints — admin only (MANAGE_GRADEBOOK_CONFIG permission)
router.post(
    '/',
    requirePermission(PERMISSIONS.MANAGE_GRADEBOOK_CONFIG),
    createConfig
);

router.put(
    '/:id',
    requirePermission(PERMISSIONS.MANAGE_GRADEBOOK_CONFIG),
    updateConfig
);

router.post(
    '/:id/clone',
    requirePermission(PERMISSIONS.MANAGE_GRADEBOOK_CONFIG),
    cloneConfig
);

export default router;
