import { curriculumRepository } from '../services/curriculum/curriculumRepository.js';
import { createCurriculumAiImportService } from '../services/curriculum/curriculumAiImportService.js';

const curriculumAiImportService = createCurriculumAiImportService({
    repository: curriculumRepository
});

export const runCurriculumImportJobCycle = async () => curriculumAiImportService.runImportJobCycle();

