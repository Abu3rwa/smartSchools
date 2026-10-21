import StandardsAssessmentSettings from '../models/StandardsAssessmentSettings.js';
import { writeAuditLog } from './assessmentAuditService.js';

/**
 * Get or create the settings document for a school.
 */
export async function getSettings(schoolId) {
  let settings = await StandardsAssessmentSettings.findOne({ school: schoolId }).lean();
  if (!settings) {
    settings = await StandardsAssessmentSettings.create({ school: schoolId });
    settings = settings.toObject();
  }
  return settings;
}

/**
 * Update settings for a school. Only permitted fields are patched.
 * Returns the updated settings document.
 */
export async function updateSettings(schoolId, updates, userId, ipAddress) {
  const before = await getSettings(schoolId);

  const allowed = ['maintenanceMode', 'pool', 'comms'];

  const patch = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (typeof updates[key] === 'object' && !Array.isArray(updates[key])) {
        for (const [subKey, subValue] of Object.entries(updates[key])) {
          patch[`${key}.${subKey}`] = subValue;
        }
      } else {
        patch[key] = updates[key];
      }
    }
  }
  patch.updatedBy = userId;

  const updated = await StandardsAssessmentSettings.findOneAndUpdate(
    { school: schoolId },
    { $set: patch },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  await writeAuditLog({
    school: schoolId,
    action: 'settings_updated',
    messageType: 'settings',
    performedBy: userId,
    beforeState: before,
    afterState: updated,
    ipAddress,
  });

  return updated;
}

export default { getSettings, updateSettings };
