import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import GradebookConfig from '../models/GradebookConfig.js';
import { getCategoryMaxMarks } from '../services/gradebookConfigService.js';
import { getDefaultMaxMarksForCategory, resolveCategoryMaxMarks } from '../utils/gradebookDefaults.js';

const stubConfig = (t, config) => {
    t.mock.method(GradebookConfig, 'findOne', () => ({
        sort: () => ({ lean: async () => config }),
        lean: async () => config
    }));
};

test('a school total wins over the built-in default', async (t) => {
    stubConfig(t, { categories: [{ key: 'exam', defaultMaxMarks: 50 }] });

    const categoryMaxMarks = await getCategoryMaxMarks('school-1', '2026-2027');

    assert.equal(resolveCategoryMaxMarks('exam', categoryMaxMarks), 50);
    assert.equal(resolveCategoryMaxMarks('Exam', categoryMaxMarks), 50);
});

test('a school that never chose a total keeps the built-in default', async (t) => {
    stubConfig(t, {
        categories: [
            { key: 'classwork', defaultMaxMarks: null },
            { key: 'project', defaultMaxMarks: 0 },
            { key: 'midterm_exam', defaultMaxMarks: 60 }
        ]
    });

    const categoryMaxMarks = await getCategoryMaxMarks('school-1', '2026-2027');

    assert.deepEqual(Object.keys(categoryMaxMarks), ['midterm_exam']);
    assert.equal(resolveCategoryMaxMarks('classwork', categoryMaxMarks), 10);
    assert.equal(resolveCategoryMaxMarks('project', categoryMaxMarks), 20);
    assert.equal(resolveCategoryMaxMarks('midterm_exam', categoryMaxMarks), 60);
});

test('no config at all leaves every category on the app defaults', async (t) => {
    stubConfig(t, null);

    const categoryMaxMarks = await getCategoryMaxMarks('school-1', '2026-2027');

    assert.deepEqual(categoryMaxMarks, {});
    assert.equal(resolveCategoryMaxMarks('quiz', categoryMaxMarks), getDefaultMaxMarksForCategory('quiz'));
    assert.equal(resolveCategoryMaxMarks('test', null), 25);
});

test('stored totals are normalised so a spaced key still matches', async (t) => {
    stubConfig(t, { categories: [{ key: 'Mid-Term Exam', defaultMaxMarks: 40 }] });

    const categoryMaxMarks = await getCategoryMaxMarks('school-1', '2026-2027');

    assert.equal(resolveCategoryMaxMarks('mid_term_exam', categoryMaxMarks), 40);
});

test('a category total outside a sensible range is rejected before it is stored', () => {
    const build = (defaultMaxMarks) => new GradebookConfig({
        school: new mongoose.Types.ObjectId(),
        academicYear: '2026-2027',
        categories: [{ key: 'exam', label: 'Exam', defaultMaxMarks }]
    });

    assert.equal(build(null).validateSync(), undefined);
    assert.equal(build(80).validateSync(), undefined);
    assert.ok(build(0).validateSync());
    assert.ok(build(5000).validateSync());
});
