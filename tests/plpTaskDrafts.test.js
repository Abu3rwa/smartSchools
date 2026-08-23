import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTaskDraftSuggestions } from '../controllers/plpV2Controller.js';

test('buildTaskDraftSuggestions uses prior student history in goal-type context', () => {
    const suggestions = buildTaskDraftSuggestions({
        goalType: 'academic',
        linkedSubjectId: 'Math',
        studentName: 'Ava Johnson',
        priorGoals: [
            { title: 'Improve multiplication fluency', status: 'completed' },
            { title: 'Build problem-solving confidence', status: 'completed' },
            { title: 'Read more carefully in math word problems', status: 'active' },
        ],
        priorTasks: [
            { title: 'Complete 10 multiplication drills', status: 'completed' },
            { title: 'Explain one strategy in writing', status: 'reviewed' },
        ],
    });

    assert.equal(Array.isArray(suggestions), true);
    assert.ok(suggestions.length >= 2);
    assert.ok(suggestions.some((item) => String(item.title).toLowerCase().includes('multiplication')));
    assert.ok(suggestions.some((item) => String(item.reason).toLowerCase().includes('prior')) || suggestions.some((item) => String(item.reason).toLowerCase().includes('history')));
});

test('buildTaskDraftSuggestions falls back to generic suggestions when there is no history', () => {
    const suggestions = buildTaskDraftSuggestions({ goalType: 'character', studentName: 'Sam Lee', priorGoals: [], priorTasks: [] });

    assert.equal(Array.isArray(suggestions), true);
    assert.ok(suggestions.length >= 2);
    assert.ok(suggestions.every((item) => typeof item.title === 'string' && item.title.length > 0));
});
