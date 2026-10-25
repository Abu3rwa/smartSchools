import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultMaxMarksForCategory, resolveCategoryMaxMarks } from './gradebookDefaults.js';

test('the built-in totals still apply when the school set nothing', () => {
    assert.equal(resolveCategoryMaxMarks('Classwork'), 10);
    assert.equal(resolveCategoryMaxMarks('project', {}), 20);
    assert.equal(resolveCategoryMaxMarks('midterm_exam', null), 25);
});

test('a school total overrides the built-in one', () => {
    const categoryMaxMarks = { exam: 50, project: 30 };

    assert.equal(resolveCategoryMaxMarks('exam', categoryMaxMarks), 50);
    assert.equal(resolveCategoryMaxMarks('Project', categoryMaxMarks), 30);
});

test('a blank or impossible stored total is ignored, not trusted', () => {
    assert.equal(getDefaultMaxMarksForCategory('unknown'), 10);
    assert.equal(resolveCategoryMaxMarks('homework', { homework: null }), 10);
    assert.equal(resolveCategoryMaxMarks('homework', { homework: 0 }), 10);
});
