import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLessonObjectives, resolveLessonObjectives } from '../helpers/lessonObjectives.js';

test('normalizeLessonObjectives derives stable objectives from legacy text', () => {
    const objectives = normalizeLessonObjectives({
        teachingObjectives: 'Identify theme\nExplain evidence\nExplain evidence',
        standardIds: ['std-1']
    });

    assert.equal(objectives.length, 2);
    assert.equal(objectives[0].text, 'Identify theme');
    assert.deepEqual(objectives[0].standardIds, ['std-1']);
    assert.equal(objectives[0].objectiveKey, normalizeLessonObjectives({ teachingObjectives: 'Identify theme' })[0].objectiveKey);
});

test('resolveLessonObjectives prefers structured objectives when present', () => {
    const objectives = resolveLessonObjectives({
        objectives: [{ objectiveKey: 'obj_custom', text: 'Write a summary', standardIds: ['std-2'], order: 0 }],
        teachingObjectives: 'Legacy text should not win'
    });

    assert.deepEqual(objectives, [{ objectiveKey: 'obj_custom', text: 'Write a summary', standardIds: ['std-2'], order: 0 }]);
});

test('normalizeLessonObjectives keeps hyphenated words intact in legacy text', () => {
    const objectives = normalizeLessonObjectives({
        teachingObjectives: "Differentiate between using 's' with third-person singular subjects and base form for other subjects."
    });

    assert.equal(objectives.length, 1);
    assert.equal(
        objectives[0].text,
        "Differentiate between using 's' with third-person singular subjects and base form for other subjects."
    );
});