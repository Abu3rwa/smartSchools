import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * BE-023: Validate tenant isolation plugin registration at startup.
 * Ensures all models with a `school` field have the tenantIsolationPlugin
 * registered. Logs warnings for any models that are missing it.
 *
 * Known cross-tenant models that legitimately skip the plugin:
 */
const CROSS_TENANT_MODELS = new Set([
    'School',
    'User',
    'Subscription',
    'SubscriptionPlan',
    'SubscriptionAuditLog',
    'LandingPageContent',
]);

export function validateTenantIsolation() {
    const models = mongoose.modelNames();
    const warnings = [];

    for (const name of models) {
        if (CROSS_TENANT_MODELS.has(name)) continue;

        const schema = mongoose.model(name).schema;
        const hasSchoolField = schema.path('school') != null;
        if (!hasSchoolField) continue;

        // Check if tenantIsolationPlugin added pre-hooks on 'find'
        const findHooks = schema.s?.hooks?._pres?.get?.('find') || [];
        const hasPlugin = findHooks.length > 0;

        if (!hasPlugin) {
            warnings.push(name);
        }
    }

    if (warnings.length > 0) {
        logger.warn(
            `BE-023: ${warnings.length} model(s) have a 'school' field but may be missing tenantIsolationPlugin`,
            { models: warnings }
        );
    } else {
        logger.info('BE-023: All tenant-scoped models have isolation plugin registered');
    }

    return warnings;
}
