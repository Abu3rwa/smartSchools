import express from 'express';
import { protect, requirePermission, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
  getPool,
  getPoolQuestionDetail,
  createFromPool,
} from '../controllers/assessmentPoolController.js';
import {
  getAssessmentSettings,
  updateAssessmentSettings,
} from '../controllers/assessmentSettingsController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(requireFeature('standardsPractice'));

router.get(
  '/pool',
  requirePermission(PERMISSIONS.VIEW_ASSESSMENT_POOL),
  getPool
);

router.get(
  '/pool/:poolId/questions/:questionId',
  requirePermission(PERMISSIONS.VIEW_ASSESSMENT_POOL),
  getPoolQuestionDetail
);

router.post(
  '/from-pool',
  requirePermission(PERMISSIONS.CREATE_ASSESSMENT_FROM_POOL),
  createFromPool
);

router.get(
  '/settings/pool',
  requirePermission(PERMISSIONS.MANAGE_ASSESSMENT_POOL_SETTINGS),
  (req, res, next) => { req.params.section = 'pool'; next(); },
  getAssessmentSettings
);

router.put(
  '/settings/pool',
  requirePermission(PERMISSIONS.MANAGE_ASSESSMENT_POOL_SETTINGS),
  (req, res, next) => { req.params.section = 'pool'; next(); },
  updateAssessmentSettings
);

router.get(
  '/settings/comms',
  requirePermission(PERMISSIONS.MANAGE_ASSESSMENT_COMMS_SETTINGS),
  (req, res, next) => { req.params.section = 'comms'; next(); },
  getAssessmentSettings
);

router.put(
  '/settings/comms',
  requirePermission(PERMISSIONS.MANAGE_ASSESSMENT_COMMS_SETTINGS),
  (req, res, next) => { req.params.section = 'comms'; next(); },
  updateAssessmentSettings
);

export default router;
