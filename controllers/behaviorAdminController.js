import { asyncHandler } from '../middleware/errorHandler.js';
import {
    getBehaviorSettings,
    updateBehaviorSettings,
    invalidateBehaviorSettingsCache
} from '../services/behavior/settingsService.js';
import {
    listBehaviorTypes,
    createBehaviorType,
    updateBehaviorType,
    listLadders,
    getLadder,
    saveLadder,
    listEmailTemplates,
    saveEmailTemplate
} from '../services/behavior/adminService.js';
import { getBehaviorReports } from '../services/behavior/reportService.js';
import { recordBehaviorAudit, BEHAVIOR_AUDIT_ACTIONS } from '../services/behavior/auditService.js';
import { canManageBehaviorAdmin } from '../services/behavior/accessService.js';

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/**
 * Families only ever need to know whether the module is switched on, so a
 * non-staff caller gets that single bit instead of the school's rule set.
 */
export const getBehaviorSettingsController = asyncHandler(async (req, res) => {
    const settings = await getBehaviorSettings(req.schoolId);
    const isStaff = canManageBehaviorAdmin(req.user)
        || ['admin', 'super_admin', 'teacher', 'staff', 'department_principal'].includes(req.user?.role);

    if (!isStaff) {
        return ok(res, { settings: { enabled: settings?.enabled === true } });
    }

    return ok(res, { settings });
});

/**
 * @desc    Enable/disable the module and edit its rules
 * @route   PATCH /api/behavior/settings
 * @access  Private (behavior admin)
 */
export const updateBehaviorSettingsController = asyncHandler(async (req, res) => {
    if (!canManageBehaviorAdmin(req.user)) {
        return res.status(403).json({
            success: false,
            message: 'Only behavior administrators can change these settings.',
            code: 'NOT_BEHAVIOR_ADMIN'
        });
    }

    const settings = await updateBehaviorSettings({
        schoolId: req.schoolId,
        patch: req.body,
        actorId: req.user._id
    });

    // The gate reads through a 30s cache, so switching the module on must be
    // visible to the very next request.
    invalidateBehaviorSettingsCache(req.schoolId);

    await recordBehaviorAudit({
        schoolId: req.schoolId,
        action: BEHAVIOR_AUDIT_ACTIONS.SETTINGS_CHANGED,
        actor: req.user,
        targetType: 'settings',
        after: {
            enabled: settings?.enabled === true,
            countingMode: settings?.counting?.mode,
            approvalDefaultRequired: settings?.approval?.defaultRequired
        }
    });

    return ok(res, { settings });
});

export const getBehaviorTypesController = asyncHandler(async (req, res) => {
    const items = await listBehaviorTypes({
        req,
        includeInactive: req.query.includeInactive === 'true'
    });
    return ok(res, { items });
});

export const createBehaviorTypeController = asyncHandler(async (req, res) => {
    const item = await createBehaviorType({ req, payload: req.body });
    return ok(res, { item }, 201);
});

export const updateBehaviorTypeController = asyncHandler(async (req, res) => {
    const item = await updateBehaviorType({ req, id: req.params.id, patch: req.body });
    return ok(res, { item });
});

export const getBehaviorLaddersController = asyncHandler(async (req, res) => {
    const items = await listLadders({ req });
    return ok(res, { items });
});

export const getBehaviorLadderController = asyncHandler(async (req, res) => {
    const ladder = await getLadder({ req, ladderId: req.params.id });
    return ok(res, { ladder });
});

/**
 * @desc    Create or replace a consequence ladder
 * @route   POST /api/behavior/ladders
 * @access  Private (behavior admin)
 */
export const saveBehaviorLadderController = asyncHandler(async (req, res) => {
    const ladder = await saveLadder({
        req,
        ladderId: req.body.ladderId || req.params.id || null,
        payload: req.body
    });
    return ok(res, { ladder }, req.params.id ? 200 : 201);
});

export const getBehaviorTemplatesController = asyncHandler(async (req, res) => {
    const items = await listEmailTemplates({ req });
    return ok(res, { items });
});

export const saveBehaviorTemplateController = asyncHandler(async (req, res) => {
    const template = await saveEmailTemplate({ req, payload: req.body });
    return ok(res, { template });
});

/**
 * @desc    Aggregated reports for the whole school
 * @route   GET /api/behavior/reports/overview
 * @access  Private (behavior admin)
 */
export const getBehaviorReportsController = asyncHandler(async (req, res) => {
    const report = await getBehaviorReports({ req, query: req.query });
    return ok(res, { report });
});
