import { asyncHandler } from '../middleware/errorHandler.js';
import { curriculumSettingsService } from '../services/curriculum/curriculumSettingsService.js';

export const createCurriculumSettingsController = ({ settingsService = curriculumSettingsService } = {}) => ({
    getCurriculumSettingsController: asyncHandler(async (req, res) => {
        const data = await settingsService.getSettings({ req });
        return res.status(200).json({ success: true, data });
    }),

    updateCurriculumSettingsController: asyncHandler(async (req, res) => {
        const data = await settingsService.updateSettings({ req });
        return res.status(200).json({ success: true, data });
    })
});

const curriculumSettingsController = createCurriculumSettingsController();

export const {
    getCurriculumSettingsController: getCurriculumSettings,
    updateCurriculumSettingsController: updateCurriculumSettings
} = curriculumSettingsController;
