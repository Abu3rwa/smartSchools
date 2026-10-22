import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { requireBehaviorSystem } from '../middleware/requireBehaviorSystem.js';
import { validateRequestSchema } from '../middleware/schemaValidator.js';
import {
    isBehaviorStaff,
    canManageBehaviorAdmin
} from '../services/behavior/accessService.js';
import {
    getBehaviorSuggestionPreview,
    logBehaviorIncidentController,
    getBehaviorIncidents,
    getBehaviorIncidentById,
    getBehaviorIncidentAudit,
    decideBehaviorApprovalController,
    voidBehaviorIncidentController,
    mergeBehaviorIncidentsController,
    getPendingBehaviorApprovals,
    resetBehaviorCountsController,
    getStudentBehaviorTrendController
} from '../controllers/behaviorController.js';
import {
    getBehaviorTasks,
    verifyBehaviorTaskController,
    getStudentReturnStatusController
} from '../controllers/behaviorTaskController.js';
import {
    getBehaviorSettingsController,
    updateBehaviorSettingsController,
    getBehaviorTypesController,
    createBehaviorTypeController,
    updateBehaviorTypeController,
    getBehaviorLaddersController,
    getBehaviorLadderController,
    saveBehaviorLadderController,
    getBehaviorTemplatesController,
    saveBehaviorTemplateController,
    getBehaviorReportsController
} from '../controllers/behaviorAdminController.js';
import {
    getBehaviorPortalOverview,
    getBehaviorPortalTasks,
    getBehaviorPortalIncident,
    submitBehaviorPortalTask
} from '../controllers/behaviorPortalController.js';
import {
    behaviorPreviewQuerySchema,
    behaviorIncidentLogBodySchema,
    behaviorIncidentsQuerySchema,
    behaviorApprovalBodySchema,
    behaviorVoidBodySchema,
    behaviorMergeBodySchema,
    behaviorCountResetBodySchema,
    behaviorTasksQuerySchema,
    behaviorTaskSubmitBodySchema,
    behaviorTaskVerifyBodySchema,
    behaviorLadderSaveBodySchema,
    behaviorTypeCreateBodySchema,
    behaviorTypeUpdateBodySchema,
    behaviorEmailTemplateBodySchema,
    behaviorSettingsPatchBodySchema,
    behaviorAuditQuerySchema,
    behaviorReportsQuerySchema,
    behaviorObjectId
} from '../validators/behaviorValidators.js';
import { z } from 'zod';

const router = express.Router();

const idParam = z.object({ id: behaviorObjectId });
const studentIdParam = z.object({ studentId: behaviorObjectId });

router.use(protect);
router.use(requireSchoolContext);

const requireBehaviorStaff = (req, res, next) => {
    if (isBehaviorStaff(req.user)) return next();
    return res.status(403).json({
        success: false,
        message: 'Behavior staff access is required for this action.',
        code: 'NOT_BEHAVIOR_STAFF'
    });
};

const requireBehaviorAdmin = (req, res, next) => {
    if (canManageBehaviorAdmin(req.user)) return next();
    return res.status(403).json({
        success: false,
        message: 'Behavior administrator access is required for this action.',
        code: 'NOT_BEHAVIOR_ADMIN'
    });
};

const requireBehaviorFamily = (req, res, next) => {
    if (['student', 'parent'].includes(req.user?.role)) return next();
    return res.status(403).json({
        success: false,
        message: 'Only students and their families can use the behavior portal.',
        code: 'NOT_PORTAL_USER'
    });
};

/**
 * Settings are the only pair reachable while the module is switched off: the UI
 * has to read the flag to decide whether to show the feature at all, and an
 * admin has to be able to turn it on.
 */
router.get('/settings', getBehaviorSettingsController);
router.patch(
    '/settings',
    requireBehaviorAdmin,
    validateRequestSchema({ bodySchema: behaviorSettingsPatchBodySchema }),
    updateBehaviorSettingsController
);

router.use(requireBehaviorSystem);

// Logging flow
router.get(
    '/suggestion/preview',
    requireBehaviorStaff,
    validateRequestSchema({ querySchema: behaviorPreviewQuerySchema }),
    getBehaviorSuggestionPreview
);
router.post(
    '/incidents',
    requireBehaviorStaff,
    validateRequestSchema({ bodySchema: behaviorIncidentLogBodySchema }),
    logBehaviorIncidentController
);
router.post(
    '/incidents/merge',
    requireBehaviorStaff,
    validateRequestSchema({ bodySchema: behaviorMergeBodySchema }),
    mergeBehaviorIncidentsController
);
router.get(
    '/incidents',
    requireBehaviorStaff,
    validateRequestSchema({ querySchema: behaviorIncidentsQuerySchema }),
    getBehaviorIncidents
);
router.get(
    '/incidents/:id',
    requireBehaviorStaff,
    validateRequestSchema({ paramsSchema: idParam }),
    getBehaviorIncidentById
);
router.get(
    '/incidents/:id/audit',
    requireBehaviorStaff,
    validateRequestSchema({
        paramsSchema: idParam,
        querySchema: behaviorAuditQuerySchema
    }),
    getBehaviorIncidentAudit
);
router.post(
    '/incidents/:id/approval',
    requireBehaviorStaff,
    validateRequestSchema({
        paramsSchema: idParam,
        bodySchema: behaviorApprovalBodySchema
    }),
    decideBehaviorApprovalController
);
router.post(
    '/incidents/:id/void',
    requireBehaviorStaff,
    validateRequestSchema({
        paramsSchema: idParam,
        bodySchema: behaviorVoidBodySchema
    }),
    voidBehaviorIncidentController
);

// Approvals and consequence work
router.get('/approvals/pending', requireBehaviorStaff, getPendingBehaviorApprovals);
router.get(
    '/tasks',
    requireBehaviorStaff,
    validateRequestSchema({ querySchema: behaviorTasksQuerySchema }),
    getBehaviorTasks
);
router.post(
    '/tasks/:id/verify',
    requireBehaviorStaff,
    validateRequestSchema({
        paramsSchema: idParam,
        bodySchema: behaviorTaskVerifyBodySchema
    }),
    verifyBehaviorTaskController
);

// Catalog, ladders, templates and reports
router.get('/types', requireBehaviorStaff, getBehaviorTypesController);
router.post(
    '/types',
    requireBehaviorAdmin,
    validateRequestSchema({ bodySchema: behaviorTypeCreateBodySchema }),
    createBehaviorTypeController
);
router.patch(
    '/types/:id',
    requireBehaviorAdmin,
    validateRequestSchema({
        paramsSchema: idParam,
        bodySchema: behaviorTypeUpdateBodySchema
    }),
    updateBehaviorTypeController
);
router.get('/ladders', requireBehaviorStaff, getBehaviorLaddersController);
router.get(
    '/ladders/:id',
    requireBehaviorStaff,
    validateRequestSchema({ paramsSchema: idParam }),
    getBehaviorLadderController
);
router.post(
    '/ladders',
    requireBehaviorAdmin,
    validateRequestSchema({ bodySchema: behaviorLadderSaveBodySchema }),
    saveBehaviorLadderController
);
router.put(
    '/ladders/:id',
    requireBehaviorAdmin,
    validateRequestSchema({
        paramsSchema: idParam,
        bodySchema: behaviorLadderSaveBodySchema
    }),
    saveBehaviorLadderController
);
router.get('/templates', requireBehaviorAdmin, getBehaviorTemplatesController);
router.post(
    '/templates',
    requireBehaviorAdmin,
    validateRequestSchema({ bodySchema: behaviorEmailTemplateBodySchema }),
    saveBehaviorTemplateController
);
router.get(
    '/reports/overview',
    requireBehaviorAdmin,
    validateRequestSchema({ querySchema: behaviorReportsQuerySchema }),
    getBehaviorReportsController
);

// Student context
router.get(
    '/students/:studentId/trend',
    requireBehaviorStaff,
    validateRequestSchema({
        paramsSchema: studentIdParam,
        querySchema: behaviorIncidentsQuerySchema.pick({ limit: true })
    }),
    getStudentBehaviorTrendController
);
router.get(
    '/students/:studentId/return-status',
    requireBehaviorStaff,
    validateRequestSchema({ paramsSchema: studentIdParam }),
    getStudentReturnStatusController
);
router.post(
    '/counts/reset',
    requireBehaviorAdmin,
    validateRequestSchema({ bodySchema: behaviorCountResetBodySchema }),
    resetBehaviorCountsController
);

// Family portal
router.get('/portal/overview', requireBehaviorFamily, getBehaviorPortalOverview);
router.get(
    '/portal/tasks',
    requireBehaviorFamily,
    validateRequestSchema({ querySchema: behaviorTasksQuerySchema }),
    getBehaviorPortalTasks
);
router.get(
    '/portal/incidents/:id',
    requireBehaviorFamily,
    validateRequestSchema({ paramsSchema: idParam }),
    getBehaviorPortalIncident
);
router.post(
    '/portal/tasks/:id/submit',
    requireBehaviorFamily,
    validateRequestSchema({
        paramsSchema: idParam,
        bodySchema: behaviorTaskSubmitBodySchema
    }),
    submitBehaviorPortalTask
);

export default router;
