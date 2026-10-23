import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import aiService from '../services/aiservice.js';
import plpAiService from '../services/plpAiService.js';

const CANDIDATES = [
    { kind: 'spelling_session', targetId: 'aaa', label: 'Spelling assessment · week 3', detail: '4 of 12 words missed' },
    { kind: 'map_practice_plan', targetId: 'bbb', label: 'Reading fluency plan', detail: 'Read aloud with expression' },
];

const GOAL = {
    goalType: 'academic',
    title: 'Read more fluently',
    description: '',
    successCriteria: 'Reads a grade-level passage with few pauses',
};

const originalGenerate = aiService.generateStructuredJson;
afterEach(() => {
    aiService.generateStructuredJson = originalGenerate;
});

const stubGenerate = (implementation) => {
    const calls = [];
    aiService.generateStructuredJson = async (options) => {
        calls.push(options);
        return implementation();
    };
    return calls;
};

test('practice link suggestions keep only ids the school actually has', async () => {
    stubGenerate(async () => ({
        parsed: {
            selections: [
                { id: 'aaa', reason: 'Matches the fluency target.' },
                { id: 'does-not-exist', reason: 'Invented.' },
                { id: 'aaa', reason: 'Duplicate.' },
            ],
        },
    }));

    const result = await plpAiService.suggestPracticeLinks(GOAL, CANDIDATES);
    assert.equal(result.unavailable, false);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].targetId, 'aaa');
    assert.equal(result.suggestions[0].kind, 'spelling_session');
    assert.equal(result.suggestions[0].label, 'Spelling assessment · week 3');
});

test('practice link suggestions cap at five and clamp the reason length', async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
        kind: 'spelling_session',
        targetId: `id-${index}`,
        label: `Session ${index}`,
        detail: '',
    }));
    stubGenerate(async () => ({
        parsed: {
            selections: many.map((candidate) => ({ id: candidate.targetId, reason: `${'long reason '.repeat(40)}` })),
        },
    }));

    const result = await plpAiService.suggestPracticeLinks(GOAL, many);
    assert.equal(result.suggestions.length, 5);
    assert.equal(result.suggestions[0].reason.length, 300);
});

test('an empty selection is a valid answer rather than a fabricated link', async () => {
    const calls = stubGenerate(async () => ({ parsed: { selections: [] } }));
    const result = await plpAiService.suggestPracticeLinks(GOAL, CANDIDATES);
    assert.deepEqual(result.suggestions, []);
    assert.equal(result.unavailable, false);
    assert.match(calls[0].prompt, /An empty list is a valid answer/);
    assert.match(calls[0].prompt, /Reads a grade-level passage/);
});

test('no candidates means no AI call at all', async () => {
    const calls = stubGenerate(async () => { throw new Error('should not run'); });
    const result = await plpAiService.suggestPracticeLinks(GOAL, []);
    assert.deepEqual(result, { suggestions: [], unavailable: false, reason: 'no_candidates' });
    assert.equal(calls.length, 0);
});

test('AI failure asks the teacher to link manually instead of guessing', async () => {
    stubGenerate(async () => { throw new Error('quota exhausted'); });
    const result = await plpAiService.suggestPracticeLinks(GOAL, CANDIDATES);
    assert.deepEqual(result, { suggestions: [], unavailable: true, reason: 'ai_unavailable' });
});
