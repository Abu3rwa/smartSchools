import WorksheetConfig from '../../models/WorksheetConfig.js';
import logger from '../../utils/logger.js';

// System defaults — used when no config exists at any level
const SYSTEM_DEFAULTS = {
    feedbackLevel: 'standard',
    partialCreditEnabled: true,
    spellingTolerance: 'moderate',
    defaultMarkingMode: 'hybrid',
    aiConfidenceThreshold: 0.90,
    teacherOverrideRequired: 'always',
    gradebookSyncMode: 'manual',
    autoStandardsDetection: true,
    autoStandardsRecording: false,
    parentCommunicationEnabled: false,
    parentViewMode: 'off',
    parentAlertEnabled: false,
    parentAlertThreshold: 60,
    studentCommunicationEnabled: true,
    studentViewMode: 'marks_only',
    correctAnswerRevealTiming: 'teacher_release'
};

const CONFIG_FIELDS = Object.keys(SYSTEM_DEFAULTS);

/**
 * Merge a chain of configs (most general → most specific).
 * Later non-null values override earlier ones.
 */
function mergeConfigs(configChain) {
    const resolved = { ...SYSTEM_DEFAULTS };

    for (const cfg of configChain) {
        if (!cfg) continue;
        const source = cfg.toObject ? cfg.toObject() : cfg;
        for (const field of CONFIG_FIELDS) {
            if (source[field] !== undefined && source[field] !== null) {
                resolved[field] = source[field];
            }
        }
    }

    return resolved;
}

/**
 * Resolve the effective worksheet config by cascading:
 * system defaults ← school ← department ← subject ← grade ← teacher ← per-worksheet overrides
 */
export async function resolveConfig(worksheet) {
    const schoolId = worksheet.school?._id || worksheet.school;

    let configs = [];
    try {
        configs = await WorksheetConfig.find({ school: schoolId }).lean();
    } catch (err) {
        logger.warn('WorksheetConfig query failed, using system defaults', err.message);
    }

    const findScope = (type, id) => {
        if (!id) return null;
        return configs.find(c => c.scopeType === type && String(c.scopeId) === String(id)) || null;
    };

    const schoolConfig = configs.find(c => c.scopeType === 'school') || null;

    const resolved = mergeConfigs([
        schoolConfig,
        findScope('department', worksheet.departmentId),
        findScope('subject', worksheet.subject?._id || worksheet.subject),
        findScope('grade', worksheet.gradeLevel),
        findScope('teacher', worksheet.teacher?._id || worksheet.teacher),
        worksheet.config // per-worksheet overrides
    ]);

    // Enforce locked fields from school config
    if (schoolConfig?.lockedFields?.length) {
        for (const field of schoolConfig.lockedFields) {
            if (SYSTEM_DEFAULTS.hasOwnProperty(field) && schoolConfig[field] !== undefined) {
                resolved[field] = schoolConfig[field];
            }
        }
    }

    return resolved;
}

/**
 * Get or create config for a specific scope.
 */
export async function getConfig(schoolId, scopeType, scopeId = null) {
    const query = { school: schoolId, scopeType };
    if (scopeId) query.scopeId = scopeId;

    let config = await WorksheetConfig.findOne(query);
    if (!config) {
        config = new WorksheetConfig({ school: schoolId, scopeType, scopeId });
    }
    return config;
}

/**
 * Update config at a given scope.
 */
export async function updateConfig(schoolId, scopeType, scopeId, updates, userId) {
    const allowed = {};
    for (const field of CONFIG_FIELDS) {
        if (updates[field] !== undefined) {
            allowed[field] = updates[field];
        }
    }
    if (updates.lockedFields !== undefined && scopeType === 'school') {
        allowed.lockedFields = updates.lockedFields;
    }
    allowed.updatedBy = userId;

    const config = await WorksheetConfig.findOneAndUpdate(
        { school: schoolId, scopeType, scopeId: scopeId || null },
        { $set: allowed },
        { new: true, upsert: true, runValidators: true }
    );
    return config;
}

export default { resolveConfig, getConfig, updateConfig, SYSTEM_DEFAULTS };
