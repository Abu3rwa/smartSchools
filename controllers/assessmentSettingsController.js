import { asyncHandler } from '../middleware/errorHandler.js';
import { getSettings, updateSettings } from '../services/assessmentSettingsService.js';

export const getAssessmentSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings(req.schoolId);
  const { section } = req.params;

  if (section && settings[section] !== undefined) {
    return res.json({ success: true, data: { [section]: settings[section] } });
  }

  return res.json({ success: true, data: settings });
});

export const updateAssessmentSettings = asyncHandler(async (req, res) => {
  const { section } = req.params;
  const updates = section && section !== 'global'
    ? { [section]: req.body }
    : req.body;

  const result = await updateSettings(
    req.schoolId,
    updates,
    req.user._id,
    req.ip
  );

  return res.json({ success: true, data: result });
});
