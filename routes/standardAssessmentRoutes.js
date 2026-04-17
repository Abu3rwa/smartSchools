import express from 'express';
import { protect, requirePermission, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';
import { PERMISSIONS } from '../config/permissions.js';
import { aiFeatureRateLimiter } from '../middleware/rateLimiters.js';

// Feature 1: Pool Library
import {
  getPool,
  getPoolQuestionDetail,
  createFromPool,
} from '../controllers/assessmentPoolController.js';

// Feature 2: Progress Table + Send
import {
  getProgressTable,
  sendProgressTableRows,
} from '../controllers/assessmentProgressController.js';

// Feature 3: Narrative Reports
import {
  generateNarrativeDraft,
  getNarrativeDraft,
  patchNarrative,
  sendNarrativeReport,
  listNarratives,
} from '../controllers/assessmentNarrativeController.js';

// Feature 4: Live Edit + Versioning
import {
  getAssessmentEditImpact,
  patchAssessment,
  createAssessmentRevision,
  publishAssessmentRevision,
  getAssessmentRevisions,
} from '../controllers/assessmentRevisionController.js';

// Settings + Audit
import {
  getAssessmentSettings,
  updateAssessmentSettings,
  getAuditLogs,
  exportAuditLogs,
} from '../controllers/assessmentSettingsAuditController.js';

const router = express.Router();

// ── Global Middleware ──
router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(requireFeature('standardsPractice'));

// ═══════════════════════════════════════════
// Feature 1: Pool Library
// ═══════════════════════════════════════════

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

// ═══════════════════════════════════════════
// Feature 2: Progress Table + Send
// ═══════════════════════════════════════════

router.get(
  '/progress-table',
  requirePermission(PERMISSIONS.SEND_ASSESSMENT_PROGRESS),
  getProgressTable
);

router.post(
  '/progress-table/send',
  requirePermission(PERMISSIONS.SEND_ASSESSMENT_PROGRESS),
  sendProgressTableRows
);

// ═══════════════════════════════════════════
// Feature 3: Narrative Reports
// ═══════════════════════════════════════════

router.get(
  '/narratives',
  requirePermission(PERMISSIONS.GENERATE_ASSESSMENT_NARRATIVE),
  listNarratives
);

router.post(
  '/narrative/generate',
  requirePermission(PERMISSIONS.GENERATE_ASSESSMENT_NARRATIVE),
  aiFeatureRateLimiter,
  generateNarrativeDraft
);

router.get(
  '/narrative/:id',
  requirePermission(PERMISSIONS.APPROVE_ASSESSMENT_NARRATIVE),
  validationRules.mongoId,
  validate,
  getNarrativeDraft
);

router.patch(
  '/narrative/:id',
  requirePermission(PERMISSIONS.APPROVE_ASSESSMENT_NARRATIVE),
  validationRules.mongoId,
  validate,
  patchNarrative
);

router.post(
  '/narrative/:id/send',
  requirePermission(PERMISSIONS.SEND_ASSESSMENT_NARRATIVE),
  validationRules.mongoId,
  validate,
  sendNarrativeReport
);

// ═══════════════════════════════════════════
// Feature 4: Live Edit + Versioning
// ═══════════════════════════════════════════

router.get(
  '/:id/edit-impact',
  requirePermission(PERMISSIONS.EDIT_LIVE_ASSESSMENT),
  validationRules.mongoId,
  validate,
  getAssessmentEditImpact
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.EDIT_LIVE_ASSESSMENT),
  validationRules.mongoId,
  validate,
  patchAssessment
);

router.get(
  '/:id/revisions',
  requirePermission(PERMISSIONS.EDIT_LIVE_ASSESSMENT),
  validationRules.mongoId,
  validate,
  getAssessmentRevisions
);

router.post(
  '/:id/revisions',
  requirePermission(PERMISSIONS.EDIT_LIVE_ASSESSMENT),
  validationRules.mongoId,
  validate,
  createAssessmentRevision
);

router.post(
  '/:id/revisions/:version/publish',
  requirePermission(PERMISSIONS.PUBLISH_ASSESSMENT_REVISION),
  publishAssessmentRevision
);

// ═══════════════════════════════════════════
// Settings Management
// ═══════════════════════════════════════════

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
  '/settings/send',
  requirePermission(PERMISSIONS.MANAGE_ASSESSMENT_SEND_SETTINGS),
  (req, res, next) => { req.params.section = 'progressSend'; next(); },
  getAssessmentSettings
);

router.put(
  '/settings/send',
  requirePermission(PERMISSIONS.MANAGE_ASSESSMENT_SEND_SETTINGS),
  (req, res, next) => { req.params.section = 'progressSend'; next(); },
  updateAssessmentSettings
);

router.get(
  '/settings/narrative',
  requirePermission(PERMISSIONS.MANAGE_ASSESSMENT_NARRATIVE_SETTINGS),
  (req, res, next) => { req.params.section = 'narrative'; next(); },
  getAssessmentSettings
);

router.put(
  '/settings/narrative',
  requirePermission(PERMISSIONS.MANAGE_ASSESSMENT_NARRATIVE_SETTINGS),
  (req, res, next) => { req.params.section = 'narrative'; next(); },
  updateAssessmentSettings
);

router.get(
  '/settings/edit',
  requirePermission(PERMISSIONS.MANAGE_ASSESSMENT_EDIT_SETTINGS),
  (req, res, next) => { req.params.section = 'liveEdit'; next(); },
  getAssessmentSettings
);

router.put(
  '/settings/edit',
  requirePermission(PERMISSIONS.MANAGE_ASSESSMENT_EDIT_SETTINGS),
  (req, res, next) => { req.params.section = 'liveEdit'; next(); },
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

// ═══════════════════════════════════════════
// Audit Logs
// ═══════════════════════════════════════════

router.get(
  '/audit-logs',
  requirePermission(PERMISSIONS.VIEW_ASSESSMENT_AUDIT_LOGS),
  getAuditLogs
);

router.post(
  '/audit-logs/export',
  requirePermission(PERMISSIONS.EXPORT_ASSESSMENT_AUDIT_LOGS),
  exportAuditLogs
);

export default router;
