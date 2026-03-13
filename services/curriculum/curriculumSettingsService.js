import { curriculumRepository } from './curriculumRepository.js';
import { assertCondition } from './curriculumErrors.js';
import {
    deepMergeCurriculumSettings,
    normalizeCurriculumSettings
} from './curriculumTemplateDefaults.js';

export const createCurriculumSettingsService = ({
    repository = curriculumRepository
} = {}) => ({
    async getSettings({ req }) {
        const school = await repository.findSchoolById(req.schoolId);
        assertCondition(school, 404, 'School not found');
        return normalizeCurriculumSettings(school.settings?.curriculum || {});
    },

    async updateSettings({ req }) {
        const school = await repository.findSchoolById(req.schoolId);
        assertCondition(school, 404, 'School not found');

        const currentSettings = normalizeCurriculumSettings(school.settings?.curriculum || {});
        school.settings = school.settings || {};
        school.settings.curriculum = normalizeCurriculumSettings(
            deepMergeCurriculumSettings(currentSettings, req.body || {})
        );
        await school.save();

        return normalizeCurriculumSettings(school.settings.curriculum);
    }
});

export const curriculumSettingsService = createCurriculumSettingsService();
