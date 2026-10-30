import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

/*
 * Both rule blocks live in one module so a refactor cannot quietly drop them.
 * These tests read the prompt sources rather than a mock, so a new prompt file
 * that forgets the rules fails CI instead of shipping.
 */

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

// Every AI prompt that can produce family- or child-facing words.
const NEEDS_CONTENT_RULES = [
    '../services/aiservice.js',
    '../services/plpAiService.js',
    '../services/classAnalyticsAIService.js',
    '../services/spellingAnalysisAIService.js',
    '../services/writingAssistantPrompts.js',
    '../services/communicationEmailService.js',
    '../services/sessionBillingInsightsService.js',
    '../services/mapPrepAiService.js',
    '../services/lessonPlanAIService.js',
    '../services/readingAssistantService.js',
    '../services/studentGroupingService.js',
    '../services/liveLessonMarkDraftService.js',
    '../services/spellingPassageService.js',
    '../services/objectiveRefinementService.js',
    '../services/newsletterAiService.js',
    '../services/newsletterChildAiService.js',
    '../services/lessonPlanEvaluationService.js',
    '../services/curriculum/curriculumAiImportService.js',
    '../services/standards_practice_ai_service/promptBuilder.js',
    '../controllers/academicExcellenceTeacherController.js',
    '../controllers/academicExcellenceStudentController.js',
    '../controllers/socialStudiesLessonController.js'
];

// Prompts that judge or write about one identifiable student.
const NEEDS_PRIVACY_RULES = [
    '../services/aiservice.js',
    '../services/plpAiService.js',
    '../services/classAnalyticsAIService.js',
    '../services/spellingAnalysisAIService.js',
    '../services/writingAssistantPrompts.js',
    '../services/communicationEmailService.js',
    '../services/sessionBillingInsightsService.js',
    '../services/readingAssistantService.js',
    '../services/liveLessonMarkDraftService.js',
    '../services/lessonPlanEvaluationService.js',
    '../services/standards_practice_ai_service/promptBuilder.js',
    '../controllers/academicExcellenceStudentController.js'
];

test('every content prompt interpolates the shared content rules', async () => {
    for (const file of NEEDS_CONTENT_RULES) {
        const source = await read(file);
        // Two uses: the import and the prompt. A list entry in a joined prompt
        // array counts the same as ${CONTENT_RULES} inside a template.
        assert.ok(
            source.split('CONTENT_RULES').length - 1 >= 2,
            `${file} must import and use CONTENT_RULES in its prompt`
        );
    }
});

test('every student-specific prompt interpolates the shared privacy rules', async () => {
    for (const file of NEEDS_PRIVACY_RULES) {
        const source = await read(file);
        assert.ok(
            source.split('PRIVACY_RULES').length - 1 >= 2,
            `${file} must import and use PRIVACY_RULES in its prompt`
        );
    }
});

test('the two rule modules are the only definition of the rules', async () => {
    const safety = await read('../services/aiPromptSafety.js');
    assert.match(safety, /export const PRIVACY_RULES/);
    assert.match(safety, /export const CONTENT_RULES/);
});

test('no prompt sends a raw student name field to the model', async () => {
    for (const file of [...NEEDS_PRIVACY_RULES]) {
        const source = await read(file);
        assert.equal(
            /STUDENT FIRST NAME:\s*\$\{/.test(source),
            false,
            `${file} must not interpolate a student first name into a prompt`
        );
    }
});
