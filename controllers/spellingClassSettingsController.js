import { asyncHandler } from '../middleware/errorHandler.js';
import { getSpellingClassSettings, updateSpellingClassSettings } from '../services/spellingClassSettingsService.js';

export const getClassSettings = asyncHandler(async (req, res) => {
    const settings = await getSpellingClassSettings({ schoolId: req.schoolId, classId: req.params.classId, teacherId: req.user._id });
    return res.json({ success: true, data: settings });
});

export const updateClassSettings = asyncHandler(async (req, res) => {
    const settings = await updateSpellingClassSettings({ schoolId: req.schoolId, classId: req.params.classId, teacherId: req.user._id, input: req.body });
    return res.json({ success: true, data: settings });
});
