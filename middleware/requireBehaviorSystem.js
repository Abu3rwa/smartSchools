import { asyncHandler } from './errorHandler.js';
import { isBehaviorSystemEnabled } from '../services/behavior/settingsService.js';

/**
 * Feature gate for the Behavior & Consequence module.
 *
 * While behaviorSystem.enabled is false the module must be invisible, so every
 * route except the settings pair answers 404 exactly like an unmounted route.
 * The settings pair stays reachable so a school admin can switch the module on.
 */
export const requireBehaviorSystem = asyncHandler(async (req, res, next) => {
    const enabled = await isBehaviorSystemEnabled(req.schoolId);
    if (enabled) return next();

    return res.status(404).json({
        success: false,
        message: 'Behavior & Consequence system is not available for this school.',
        code: 'BEHAVIOR_SYSTEM_DISABLED'
    });
});
