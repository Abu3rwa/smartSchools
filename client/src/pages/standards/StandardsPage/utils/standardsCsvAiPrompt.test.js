import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStandardsCsvAiPrompt } from './standardsCsvAiPrompt.js';
import { parseStandardsImportText } from './standardsPagePresentation.js';

test('parses the standards CSV template columns and selected subject', () => {
    const csv = [
        'code,name,description,subjectCode,gradeLevel,category,masteryThreshold,masteryMinQuestions,isActive',
        'ELA.5.RL.1,Quote accurately,"Use evidence, including ""quoted text"".",ELA5,5,Reading Literature,80,5,true'
    ].join('\r\n');

    assert.deepEqual(parseStandardsImportText(csv, '', 'subject-id'), [{
        code: 'ELA.5.RL.1',
        name: 'Quote accurately',
        description: 'Use evidence, including "quoted text".',
        gradeLevel: 5,
        category: 'Reading Literature',
        masteryThreshold: 80,
        masteryMinQuestions: 5,
        isActive: true,
        subject: 'subject-id'
    }]);
});

test('builds an AI prompt with the exact standards template and selected subject', () => {
    const prompt = buildStandardsCsvAiPrompt({
        subjectName: 'English Language Arts 5',
        subjectCode: 'ELA5'
    });

    assert.ok(prompt.includes('English Language Arts 5'));
    assert.ok(prompt.includes('Subject code: ELA5.'));
    assert.ok(prompt.includes('code,name,description,subjectCode,gradeLevel,category,masteryThreshold,masteryMinQuestions,isActive'));
    assert.ok(prompt.includes('Return only valid CSV text'));
});
